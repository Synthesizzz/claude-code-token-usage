# Raises a Windows notification with the crab in it, for news that calls the
# person back to Claude: a finished task, a question, a request for leave to
# use a tool, a reminder ten minutes after a task finished unanswered, and
# the mod's own usage alerts.
#
# Claude Code runs it as a command hook (hooks/hooks.json) with the hook's
# JSON on standard input and the kind of news as the first argument. It
# prints nothing: what a hook prints can reach the conversation.
#
# It stays quiet while the window in front belongs to the program hosting
# the session, and when ~/.claude/token-usage/notify.json says isOn: false
# or the hour is in its quiet hours. That file's isPrivate (on unless it says
# false) keeps commands and questions out of what is shown.
# TOKEN_USAGE_NOTIFY_FILE names another file in its place, for a try-out,
# and TOKEN_USAGE_NOTIFY_STATE another folder for its log and its state.
#
# A sound of one's own: ~/.claude/token-usage/sounds/<kind>.wav, where the
# kind is done, ask, allow, wait (still waiting) or an alert's pose, plays in
# place of the Windows sound. TOKEN_USAGE_NOTIFY_SOUNDS names another folder.
#
# Where Windows takes notifications, the news comes in a window of the mod's
# own: a card that bounces out of the corner with the crab bobbing in it and
# confetti, for six seconds, without taking the focus; a click on it brings
# Claude to the front. The same notification goes quietly to the notification
# centre. The file's hasPopup: false (/tokens popup off) keeps to plain
# notifications. For a try-out, TOKEN_USAGE_NOTIFY_POPUP=0 keeps to plain
# notifications and =1 shows the window even where Windows holds
# notifications back; either wins over the file.
# TOKEN_USAGE_NOTIFY_DRY=1 prints what it would do instead of doing it;
# TOKEN_USAGE_NOTIFY_FORCE=1 shows it even while the session is in front.
param(
  [Parameter(Position = 0)][string]$Kind = '',
  [Parameter(Position = 1)][string]$Session = '',
  [Parameter(Position = 2)][string]$Stamp = '',
  [Parameter(Position = 3)][string]$Project = '',
  [Parameter(Position = 4)][string]$Hosts = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$stateDir = $env:TOKEN_USAGE_NOTIFY_STATE
if (-not $stateDir) { $stateDir = Join-Path $env:TEMP 'token-usage-notify' }
$soundDir = $env:TOKEN_USAGE_NOTIFY_SOUNDS
if (-not $soundDir) { $soundDir = Join-Path $env:USERPROFILE '.claude\token-usage\sounds' }
$isDry = $env:TOKEN_USAGE_NOTIFY_DRY -eq '1'
$isForced = $env:TOKEN_USAGE_NOTIFY_FORCE -eq '1'
# A task that finished is called "still waiting" after this long unanswered.
$waitSeconds = 600
$pollSeconds = 20
# Where a walk up the process tree stops: these start everything else.
$roots = @('explorer', 'services', 'svchost', 'wininit', 'winlogon', 'userinit', 'sihost', 'system', 'idle')

function Write-Log([string]$line) {
  try {
    if (-not (Test-Path $stateDir)) { [void](New-Item -ItemType Directory -Path $stateDir -Force) }
    $log = Join-Path $stateDir 'log.txt'
    if ((Test-Path $log) -and ((Get-Item $log).Length -gt 100000)) { Remove-Item $log -Force }
    Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $line) -Encoding UTF8
  } catch { }
}

# What the mod says: on or off, private or not, its quiet hours, and whether
# the news comes in the crab's own window.
function Get-Settings {
  $settings = @{ isOn = $true; isPrivate = $true; isQuiet = $false; hasPopup = $true }
  try {
    $file = $env:TOKEN_USAGE_NOTIFY_FILE
    if (-not $file) { $file = Join-Path $env:USERPROFILE '.claude\token-usage\notify.json' }
    if (Test-Path $file) {
      $kept = Get-Content $file -Raw | ConvertFrom-Json
      $settings.isOn = $kept.isOn -ne $false
      $settings.isPrivate = $kept.isPrivate -ne $false
      $settings.hasPopup = $kept.hasPopup -ne $false
      if ($null -ne $kept.quiet) {
        $from = [int]$kept.quiet.from
        $to = [int]$kept.quiet.to
        $hour = (Get-Date).Hour
        if ($from -lt $to) { $settings.isQuiet = ($hour -ge $from) -and ($hour -lt $to) }
        elseif ($from -gt $to) { $settings.isQuiet = ($hour -ge $from) -or ($hour -lt $to) }
      }
    }
  } catch { }
  return $settings
}

# The names of the programs this script runs inside: the session, and
# whatever shows its window.
function Get-HostNames {
  $all = @{}
  foreach ($process in (Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name)) {
    $all[[int]$process.ProcessId] = $process
  }
  $names = @()
  $id = $PID
  for ($step = 0; $step -lt 16 -and $all.ContainsKey($id); $step++) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($all[$id].Name).ToLowerInvariant()
    if ($roots -contains $name) { break }
    if ($names -notcontains $name) { $names += $name }
    $id = [int]$all[$id].ParentProcessId
  }
  return $names
}

function Get-FrontName {
  if (-not ('TokenUsage.Front' -as [type])) {
    Add-Type -Namespace TokenUsage -Name Front -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr window, out uint processId);
'@
  }
  $processId = 0
  [void][TokenUsage.Front]::GetWindowThreadProcessId([TokenUsage.Front]::GetForegroundWindow(), [ref]$processId)
  if ($processId -eq 0) { return '' }
  return (Get-Process -Id $processId).ProcessName.ToLowerInvariant()
}

function Format-Elapsed([double]$seconds) {
  $whole = [int][Math]::Floor($seconds)
  if ($whole -lt 60) { return ('{0}s' -f $whole) }
  if ($whole -lt 3600) { return ('{0}m {1:00}s' -f [int][Math]::Floor($whole / 60), ($whole % 60)) }
  return ('{0}h {1:00}m' -f [int][Math]::Floor($whole / 3600), [int][Math]::Floor(($whole % 3600) / 60))
}

function Limit([string]$text, [int]$most) {
  $line = ($text -replace '\s+', ' ').Trim()
  if ($line.Length -le $most) { return $line }
  return $line.Substring(0, $most - 1) + [char]0x2026
}

# A notification shows on the lock screen and stays in the notification
# centre: what looks like a secret is put out of sight, before the line is cut
# short, so no part of one is left.
function Hide-Secrets([string]$text) {
  $dots = [string][char]0x2022 * 3
  $text = $text -replace '(?i)\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}', ('${1} ' + $dots)
  $text = $text -replace '\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})', $dots
  $text = $text -replace '(?i)([\w-]*(?:key|token|secret|passw(?:or)?d|pwd|credential)[\w-]*\s*[=:]\s*)(?:"[^"]*"|''[^'']*''|[^\s&"'']+)', ('${1}' + $dots)
  return $text
}

# The person's own sound for a pose, or $null where there is none.
function Get-Sound([string]$pose) {
  $name = $pose
  if ($pose -eq 'sleep') { $name = 'wait' }
  $path = Join-Path $soundDir ('{0}.wav' -f $name)
  if (Test-Path $path) { return $path }
  return $null
}

function Add-Win32 {
  if (-not ('TokenUsage.Win' -as [type])) {
    Add-Type -Namespace TokenUsage -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern int GetWindowLong(System.IntPtr window, int index);
[DllImport("user32.dll")] public static extern int SetWindowLong(System.IntPtr window, int index, int value);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr window);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr window, int show);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr window);
[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
'@
  }
}

# Whether the news comes in the crab's own window: where Windows takes
# notifications now (not in a presentation, a full-screen app or quiet time),
# unless /tokens popup off says not to.
function Test-Popup([bool]$hasPopup) {
  if ($env:TOKEN_USAGE_NOTIFY_POPUP -eq '0') { return $false }
  if ($env:TOKEN_USAGE_NOTIFY_POPUP -eq '1') { return $true }
  if (-not $hasPopup) { return $false }
  try {
    Add-Win32
    $state = 0
    [void][TokenUsage.Win]::SHQueryUserNotificationState([ref]$state)
    return $state -eq 5
  } catch { return $false }
}

# Brings the Claude app to the front, restored if it was minimised.
function Show-Claude {
  try {
    Add-Win32
    $app = Get-Process -Name 'claude' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [System.IntPtr]::Zero } | Select-Object -First 1
    if ($app) {
      if ([TokenUsage.Win]::IsIconic($app.MainWindowHandle)) { [void][TokenUsage.Win]::ShowWindow($app.MainWindowHandle, 9) }
      [void][TokenUsage.Win]::SetForegroundWindow($app.MainWindowHandle)
    }
  } catch { Write-Log ('bringing Claude to the front failed: {0}' -f $_.Exception.Message) }
}

function Show-Popup([string]$pose, [string]$title, [string]$text, [string]$sound) {
  Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
  Add-Win32
  $esc = [System.Security.SecurityElement]
  $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True"
        ShowInTaskbar="False" ShowActivated="False" ResizeMode="NoResize" SizeToContent="WidthAndHeight">
  <Grid Margin="70,90,16,16">
    <Border x:Name="Card" Width="360" Background="#2B2D31" BorderBrush="#3A3D42" BorderThickness="1"
            CornerRadius="12" Padding="14" RenderTransformOrigin="0.9,1" Cursor="Hand">
      <Border.Effect><DropShadowEffect BlurRadius="24" ShadowDepth="6" Opacity="0.45"/></Border.Effect>
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="72"/><ColumnDefinition Width="*"/><ColumnDefinition Width="20"/>
        </Grid.ColumnDefinitions>
        <Image x:Name="Crab" Width="72" Height="72" RenderOptions.BitmapScalingMode="NearestNeighbor"/>
        <StackPanel Grid.Column="1" Margin="12,0,0,0" VerticalAlignment="Center">
          <TextBlock Text="$($esc::Escape($title))" Foreground="#E8E9EC" FontFamily="Segoe UI" FontSize="14"
                     FontWeight="SemiBold" TextTrimming="CharacterEllipsis"/>
          <TextBlock Text="$($esc::Escape($text))" Foreground="#9AA0AA" FontFamily="Segoe UI" FontSize="13"
                     TextWrapping="Wrap" MaxHeight="36" TextTrimming="CharacterEllipsis"/>
        </StackPanel>
        <TextBlock x:Name="Shut" Grid.Column="2" Foreground="#9AA0AA" FontSize="13" Cursor="Hand"
                   VerticalAlignment="Top" HorizontalAlignment="Right"/>
      </Grid>
    </Border>
    <Canvas x:Name="Fx" IsHitTestVisible="False"/>
  </Grid>
</Window>
"@
  $window = [Windows.Markup.XamlReader]::Parse($xaml)
  $card = $window.FindName('Card')
  $crab = $window.FindName('Crab')
  $shut = $window.FindName('Shut')
  $fx = $window.FindName('Fx')
  $shut.Text = [string][char]0x2715
  $picture = Join-Path $root ('assets\crab\{0}.png' -f $pose)
  if (Test-Path $picture) { $crab.Source = New-Object System.Windows.Media.Imaging.BitmapImage (New-Object System.Uri $picture) }

  # It never takes the focus, and stays out of the task switcher.
  $window.Add_SourceInitialized({
    $handle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $style = [TokenUsage.Win]::GetWindowLong($handle, -20)
    [void][TokenUsage.Win]::SetWindowLong($handle, -20, ($style -bor 0x08000000 -bor 0x80))
  })
  $window.Add_ContentRendered({
    $area = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $area.Right - $window.ActualWidth
    $window.Top = $area.Bottom - $window.ActualHeight
  })

  $animation = [System.Windows.Media.Animation.DoubleAnimation]
  $span = { param($ms) [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds($ms)) }

  # It bounces out of the corner.
  $scale = New-Object System.Windows.Media.ScaleTransform 0.3, 0.3
  $move = New-Object System.Windows.Media.TranslateTransform 0, 0
  $group = New-Object System.Windows.Media.TransformGroup
  $group.Children.Add($scale)
  $group.Children.Add($move)
  $card.RenderTransform = $group
  $back = New-Object System.Windows.Media.Animation.BackEase
  $back.Amplitude = 0.6
  $back.EasingMode = 'EaseOut'
  $grow = $animation::new(0.3, 1.0, (& $span 600))
  $grow.EasingFunction = $back
  $scale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $grow)
  $scale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $grow)
  $card.Opacity = 0
  $card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $animation::new(0.0, 1.0, (& $span 250)))

  # The crab bobs while it is there.
  $bob = New-Object System.Windows.Media.TranslateTransform 0, 0
  $crab.RenderTransform = $bob
  $up = $animation::new(0.0, -4.0, (& $span 380))
  $up.AutoReverse = $true
  $up.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
  $bob.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $up)

  # Confetti bursts from the crab once the card is out.
  $colours = @('#FF6B80', '#FFC107', '#4EBA65', '#38BDF8', '#C084FC', '#D97757')
  $cubic = New-Object System.Windows.Media.Animation.CubicEase
  $cubic.EasingMode = 'EaseOut'
  for ($index = 0; $index -lt 18; $index++) {
    $angle = ($index / 18) * [Math]::PI * 2
    $bit = New-Object System.Windows.Shapes.Rectangle
    $bit.Width = 6
    $bit.Height = 6
    $bit.Fill = (New-Object System.Windows.Media.BrushConverter).ConvertFromString($colours[$index % $colours.Count])
    $bit.Opacity = 0
    [System.Windows.Controls.Canvas]::SetLeft($bit, 50)
    [System.Windows.Controls.Canvas]::SetTop($bit, 50)
    $place = New-Object System.Windows.Media.TranslateTransform 0, 0
    $turn = New-Object System.Windows.Media.RotateTransform 0
    $both = New-Object System.Windows.Media.TransformGroup
    $both.Children.Add($turn)
    $both.Children.Add($place)
    $bit.RenderTransform = $both
    [void]$fx.Children.Add($bit)
    $start = [TimeSpan]::FromMilliseconds(550)
    $x = $animation::new(0.0, [Math]::Cos($angle) * (50 + ($index % 3) * 16), (& $span 1300))
    $y = $animation::new(0.0, [Math]::Sin($angle) * (40 + ($index % 4) * 12) - 24, (& $span 1300))
    $spin = $animation::new(0.0, $index * 40.0, (& $span 1300))
    $fade = $animation::new(1.0, 0.0, (& $span 1300))
    foreach ($one in @($x, $y, $spin, $fade)) { $one.BeginTime = $start; $one.EasingFunction = $cubic }
    $place.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $x)
    $place.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $y)
    $turn.BeginAnimation([System.Windows.Media.RotateTransform]::AngleProperty, $spin)
    $bit.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fade)
  }

  # After six seconds it slides away; a click on it brings Claude forward.
  $leave = {
    $away = $animation::new(0.0, 420.0, (& $span 500))
    $away.Add_Completed({ $window.Close() })
    $move.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, $away)
    $card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $animation::new(1.0, 0.0, (& $span 500)))
  }
  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromSeconds(6.6)
  $timer.Add_Tick({ $timer.Stop(); & $leave })
  $shut.Add_MouseLeftButtonUp({ param($sender, $e) $e.Handled = $true; $timer.Stop(); $window.Close() })
  $card.Add_MouseLeftButtonUp({ $timer.Stop(); Show-Claude; $window.Close() })
  $window.Add_Closed({ [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() })

  if ($sound) { $tune = $sound } else { $tune = Join-Path $env:WINDIR 'Media\Windows Notify System Generic.wav' }
  if (Test-Path $tune) {
    try { (New-Object System.Media.SoundPlayer $tune).Play() }
    catch { Write-Log ('sound {0} did not play: {1}' -f $tune, $_.Exception.Message) }
  }
  $window.Show()
  $timer.Start()
  [System.Windows.Threading.Dispatcher]::Run()
}

# `quiet` sends it straight to the notification centre, silent, with no banner:
# the crab's own window has shown it.
function Show-Toast([string]$pose, [string]$title, [string]$text, [string]$sound, [bool]$quiet = $false) {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $image = ''
  $picture = Join-Path $root ('assets\crab\{0}.png' -f $pose)
  if (Test-Path $picture) {
    $source = 'file:///' + ($picture -replace '\\', '/')
    $image = '<image placement="appLogoOverride" src="{0}"/>' -f [System.Security.SecurityElement]::Escape($source)
  }
  # A sound of one's own is played here: the notification itself stays silent.
  $audio = ''
  if ($sound -or $quiet) { $audio = '<audio silent="true"/>' }
  $xml = '<toast><visual><binding template="ToastGeneric">{0}<text>{1}</text><text>{2}</text></binding></visual>{3}</toast>' -f $image, [System.Security.SecurityElement]::Escape($title), [System.Security.SecurityElement]::Escape($text), $audio
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $app = (Get-StartApps | Where-Object { $_.Name -eq 'Claude' } | Select-Object -First 1).AppID
  if (-not $app) { $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe' }
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  # One notification per kind of news: a newer one takes the older one's place.
  $toast.Tag = $pose
  $toast.Group = 'token-usage'
  $toast.SuppressPopup = $quiet
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
  if ($sound -and -not $quiet) {
    try { (New-Object System.Media.SoundPlayer $sound).PlaySync() }
    catch { Write-Log ('sound {0} did not play: {1}' -f $sound, $_.Exception.Message) }
  }
}

# Raises the notification unless it is switched off or the person is already
# looking at the session.
function Send-News([string]$pose, [string]$title, [string]$text, [string[]]$hostNames) {
  $front = Get-FrontName
  $isFront = ($hostNames -contains $front) -or ($front -eq 'claude')
  $settings = Get-Settings
  $isOn = $settings.isOn
  # Quiet hours hold even for a try-out that shows what is in front.
  $shows = $isOn -and -not $settings.isQuiet -and ($isForced -or -not $isFront)
  $sound = Get-Sound $pose
  $popup = Test-Popup $settings.hasPopup
  if ($isDry) {
    Write-Output (@{ kind = $Kind; pose = $pose; title = $title; text = $text; front = $front; hosts = ($hostNames -join ','); isFront = $isFront; isOn = $isOn; isQuiet = $settings.isQuiet; shows = $shows; sound = $sound; popup = $popup } | ConvertTo-Json -Compress)
    return
  }
  Write-Log ('{0}: pose={1} front={2} on={3} shown={4} popup={5} title="{6}"' -f $Kind, $pose, $front, $isOn, $shows, $popup, $title)
  if (-not $shows) { return }
  if (-not $popup) {
    Show-Toast $pose $title $text $sound
    return
  }
  # The window of its own, with the notification kept quietly in the centre;
  # a window that cannot be drawn falls back to the plain notification.
  try { Show-Toast $pose $title $text $sound $true } catch { Write-Log ('quiet notification failed: {0}' -f $_.Exception.Message) }
  try { Show-Popup $pose $title $text $sound }
  catch {
    Write-Log ('popup failed: {0}' -f $_.Exception.Message)
    Show-Toast $pose $title $text $sound
  }
}

function Read-Hook {
  $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
  $raw = $reader.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return $raw | ConvertFrom-Json
}

function Get-Id($hook) {
  return ([string]$hook.session_id) -replace '[^A-Za-z0-9_-]', ''
}

function Get-Leaf([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return 'Claude Code' }
  return (Split-Path -Leaf ($path.TrimEnd('\', '/'))) -replace '["`]', ''
}

try {
  if (-not (Test-Path $stateDir)) { [void](New-Item -ItemType Directory -Path $stateDir -Force) }

  switch ($Kind) {
    # A prompt was sent: the turn's clock starts, and nobody is kept waiting.
    'prompt' {
      $hook = Read-Hook
      $id = Get-Id $hook
      if ($id) {
        Set-Content -Path (Join-Path $stateDir "$id.start") -Value ([DateTime]::UtcNow.Ticks) -Encoding ASCII
        Remove-Item (Join-Path $stateDir "$id.wait") -Force -ErrorAction SilentlyContinue
      }
    }

    # The turn ended. A stop that another hook turned back into work comes
    # again with stop_hook_active set, and is not news twice.
    'stop' {
      $hook = Read-Hook
      if ($hook.stop_hook_active -eq $true) { break }
      $id = Get-Id $hook
      $project = Get-Leaf ([string]$hook.cwd)
      $text = $project
      $started = Join-Path $stateDir "$id.start"
      if ($id -and (Test-Path $started)) {
        $ticks = [long](Get-Content $started -Raw)
        $text = '{0}, after {1}.' -f $project, (Format-Elapsed (([DateTime]::UtcNow.Ticks - $ticks) / 10000000))
      }
      $hostNames = Get-HostNames
      Send-News 'done' 'Claude is done' $text $hostNames
      if ($id -and -not $isDry) {
        $stamp = [guid]::NewGuid().ToString('N')
        Set-Content -Path (Join-Path $stateDir "$id.wait") -Value $stamp -Encoding ASCII
        $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath), 'wait', $id, $stamp, ('"{0}"' -f $project), ('"{0}"' -f ($hostNames -join ',')))
        Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList $arguments
      }
    }

    # Started by 'stop', with no hook input: gives up as soon as a newer stop
    # or a prompt changes the stamp, and otherwise says Claude is still
    # waiting once the time is up.
    'wait' {
      $file = Join-Path $stateDir "$Session.wait"
      $until = (Get-Date).AddSeconds($waitSeconds)
      while ((Get-Date) -lt $until) {
        Start-Sleep -Seconds $pollSeconds
        if (-not (Test-Path $file) -or ((Get-Content $file -Raw).Trim() -ne $Stamp)) { return }
      }
      Remove-Item $file -Force -ErrorAction SilentlyContinue
      Send-News 'sleep' 'Claude is still waiting' ('Done 10 minutes ago: {0}.' -f $Project) ($Hosts -split ',')
    }

    # Claude asks the person to choose.
    'ask' {
      $hook = Read-Hook
      $question = ''
      if ($hook.tool_input.questions) { $question = [string]$hook.tool_input.questions[0].question }
      if (-not $question) { $question = 'Claude is waiting for your answer.' }
      if ((Get-Settings).isPrivate) { $question = 'Open Claude to answer.' }
      Send-News 'ask' 'Claude has a question' (Limit (Hide-Secrets $question) 140) (Get-HostNames)
    }

    # Claude needs leave to use a tool.
    'allow' {
      $hook = Read-Hook
      $what = [string]$hook.tool_name
      if (-not (Get-Settings).isPrivate) {
        foreach ($field in @('command', 'file_path', 'url', 'path', 'pattern')) {
          $value = [string]$hook.tool_input.$field
          if ($value) { $what = '{0}: {1}' -f $hook.tool_name, $value; break }
        }
      }
      if (-not $what) { $what = 'A tool is waiting for your approval.' }
      Send-News 'allow' 'Claude needs your OK' (Limit (Hide-Secrets $what) 140) (Get-HostNames)
    }

    # A notification raised inside Claude Code. Only the mod's own usage
    # alerts are carried outside: the pose is read off the title.
    'notice' {
      $hook = Read-Hook
      $title = [string]$hook.title
      $text = [string]$hook.message
      Write-Log ('notice seen: type="{0}" title="{1}"' -f $hook.notification_type, $title)
      if ($title -notmatch 'window|limit reached|^Context at|cost at|budget|^Test alert') { break }
      $pose = 'near'
      if ($title -match 'limit reached|is spent') { $pose = 'jail' }
      elseif ($title -match 'reset$') { $pose = 'back' }
      elseif ($title -match '^Context') { $pose = 'context' }
      elseif ($title -match 'fills in') { $pose = 'pace' }
      Send-News $pose (Limit $title 100) (Limit $text 140) (Get-HostNames)
    }

    default { Write-Log ('unknown kind "{0}"' -f $Kind) }
  }
} catch {
  Write-Log ('{0} failed: {1}' -f $Kind, $_.Exception.Message)
}

exit 0
