# Tries tools/notify/toast.ps1 in dry mode: each case feeds it a hook's JSON
# and reads what it would raise, without raising anything.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/notify/toast.test.ps1
#
# Exits 1 when a case fails.
param([string]$Script = (Join-Path $PSScriptRoot 'toast.ps1'))
$failures = 0

$switch = Join-Path ([System.IO.Path]::GetTempPath()) ('token-usage-test-{0}.json' -f [guid]::NewGuid().ToString('N'))
# The script's log and state go here, not where the hooks keep theirs.
$state = Join-Path ([System.IO.Path]::GetTempPath()) ('token-usage-test-{0}' -f [guid]::NewGuid().ToString('N'))
$realLog = Join-Path $env:TEMP 'token-usage-notify\log.txt'
# The person's own sounds, a .wav per kind of news.
$sounds = Join-Path ([System.IO.Path]::GetTempPath()) ('token-usage-test-{0}-sounds' -f [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $sounds -Force)
Set-Content -Path (Join-Path $sounds 'ask.wav') -Value 'RIFF' -Encoding ASCII
$realLength = if (Test-Path $realLog) { (Get-Item $realLog).Length } else { 0 }

# What the script would raise for a hook, or $null where it raises nothing.
# The mod's switch file says what `$settings` hold; with none, there is no
# file and the script's own defaults stand. Privacy is off unless a case asks.
function Invoke-Toast([string]$kind, $hook, $settings = @{ isPrivate = $false }) {
  $env:TOKEN_USAGE_NOTIFY_DRY = '1'
  $env:TOKEN_USAGE_NOTIFY_FORCE = '1'
  $env:TOKEN_USAGE_NOTIFY_FILE = $switch
  $env:TOKEN_USAGE_NOTIFY_STATE = $state
  $env:TOKEN_USAGE_NOTIFY_SOUNDS = $sounds
  Remove-Item $switch -Force -ErrorAction SilentlyContinue
  if ($null -ne $settings) { $settings | ConvertTo-Json -Compress | Set-Content -Path $switch -Encoding ASCII }
  $json = $hook | ConvertTo-Json -Depth 6 -Compress
  $out = $json | powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Script $kind
  if (-not $out) { return $null }
  return ($out | Select-Object -Last 1) | ConvertFrom-Json
}

function Test-Case([string]$name, [scriptblock]$check) {
  try {
    $problem = & $check
  } catch {
    $problem = $_.Exception.Message
  }
  if ($problem) {
    $script:failures++
    Write-Output ('FAIL {0}: {1}' -f $name, $problem)
  } else {
    Write-Output ('pass {0}' -f $name)
  }
}

function Assert-Hidden($shown, [string]$secret) {
  if ($null -eq $shown) { return 'nothing was raised' }
  if (($shown.title + ' ' + $shown.text).Contains($secret)) { return ('"{0}" is shown: {1}' -f $secret, $shown.text) }
}

function Bash([string]$command) {
  return @{ session_id = 'test'; tool_name = 'Bash'; tool_input = @{ command = $command } }
}

# A notification shows on the lock screen and stays in the notification
# centre: a secret in what Claude asks to run must not be in it.
Test-Case 'a bearer token in a command is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash 'curl -H "Authorization: Bearer abcDEF123456ghiJKL7890" https://api.example.com')) 'abcDEF123456ghiJKL7890'
}
Test-Case 'an API key with a known prefix is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash 'git push https://ghp_0123456789abcdefABCDEF0123456789abcd@github.com/a/b')) 'ghp_0123456789abcdefABCDEF0123456789abcd'
}
Test-Case 'an Anthropic key is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash 'claude --key sk-ant-api03-Zx9Qw8Er7Ty6Ui5Op4As3Df2')) 'sk-ant-api03-Zx9Qw8Er7Ty6Ui5Op4As3Df2'
}
Test-Case 'a secret set in a variable is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash 'export OPENAI_API_KEY=plainvalue42 && node run.js')) 'plainvalue42'
}
Test-Case 'a password given as an option is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash 'mysql -u root --password=hunter2 shop')) 'hunter2'
}
Test-Case 'a token in a URL is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' @{ session_id = 'test'; tool_name = 'WebFetch'; tool_input = @{ url = 'https://example.com/feed?user=me&access_token=q1w2e3r4t5' } }) 'q1w2e3r4t5'
}
Test-Case 'a secret in a question is hidden' {
  Assert-Hidden (Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Use the key sk-proj-AbCdEfGh1234567890IjKl for the deploy?' }) } }) 'sk-proj-AbCdEfGh1234567890IjKl'
}

Test-Case 'a secret cut short at the end of the line is hidden' {
  Assert-Hidden (Invoke-Toast 'allow' (Bash (('echo ' * 25) + 'sk-ant-api03-LongSecretValue1234567'))) 'sk-ant'
}

# What is not a secret still reads as it was.
Test-Case 'an ordinary command reads in full' {
  $shown = Invoke-Toast 'allow' (Bash 'git log --oneline -5')
  if ($shown.text -ne 'Bash: git log --oneline -5') { return ('text is "{0}"' -f $shown.text) }
}
Test-Case 'a path reads in full' {
  $shown = Invoke-Toast 'allow' @{ session_id = 'test'; tool_name = 'Write'; tool_input = @{ file_path = 'C:\work\token_budget.md' } }
  if ($shown.text -ne 'Write: C:\work\token_budget.md') { return ('text is "{0}"' -f $shown.text) }
}
Test-Case 'a stop another hook turned back into work raises nothing' {
  $shown = Invoke-Toast 'stop' @{ session_id = 'test'; stop_hook_active = $true; cwd = 'C:\work\shop' }
  if ($null -ne $shown) { return 'a notification was raised' }
}
Test-Case 'a notice that is not the mod''s own raises nothing' {
  $shown = Invoke-Toast 'notice' @{ session_id = 'test'; title = 'Build finished'; message = 'All green' }
  if ($null -ne $shown) { return 'a notification was raised' }
}

# Privacy, on unless the mod says off: no command and no question shown.
Test-Case 'with no word from the mod, a request names only its tool' {
  $shown = Invoke-Toast 'allow' (Bash 'npm run deploy -- --env prod') $null
  if ($shown.text -ne 'Bash') { return ('text is "{0}"' -f $shown.text) }
}
Test-Case 'with privacy on, a question is not repeated' {
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy to prod?' }) } } @{ isPrivate = $true }
  if ($shown.text -ne 'Open Claude to answer.') { return ('text is "{0}"' -f $shown.text) }
}

# Quiet hours: nothing is raised in them, even with the session behind.
$hour = (Get-Date).Hour
Test-Case 'in quiet hours nothing is shown' {
  $shown = Invoke-Toast 'allow' (Bash 'git status') @{ isPrivate = $false; quiet = @{ from = $hour; to = ($hour + 1) % 24 } }
  if ($shown.shows -ne $false) { return 'it would be shown' }
}
Test-Case 'outside quiet hours it is shown' {
  $shown = Invoke-Toast 'allow' (Bash 'git status') @{ isPrivate = $false; quiet = @{ from = ($hour + 1) % 24; to = ($hour + 2) % 24 } }
  if ($shown.shows -ne $true) { return 'it would not be shown' }
}

# A sound of one's own: the kind's .wav where there is one, else the default.
Test-Case 'news with a sound of its own plays that file' {
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy?' }) } }
  if ($shown.sound -ne (Join-Path $sounds 'ask.wav')) { return ('sound is "{0}"' -f $shown.sound) }
}
Test-Case 'news with no sound of its own keeps the default' {
  $shown = Invoke-Toast 'allow' (Bash 'git status')
  if ($null -ne $shown.sound) { return ('sound is "{0}"' -f $shown.sound) }
}

# The crab's own window: on where Windows takes notifications, or as a
# try-out names it; the notification still goes to the notification centre.
Test-Case 'with popups switched off the news is a plain notification' {
  $env:TOKEN_USAGE_NOTIFY_POPUP = '0'
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy?' }) } }
  Remove-Item Env:TOKEN_USAGE_NOTIFY_POPUP
  if ($shown.popup -ne $false) { return ('popup is "{0}"' -f $shown.popup) }
}
Test-Case 'with popups switched on the news comes in the crab''s own window' {
  $env:TOKEN_USAGE_NOTIFY_POPUP = '1'
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy?' }) } }
  Remove-Item Env:TOKEN_USAGE_NOTIFY_POPUP
  if ($shown.popup -ne $true) { return ('popup is "{0}"' -f $shown.popup) }
}
Test-Case 'with /tokens popup off the news is a plain notification' {
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy?' }) } } @{ isPrivate = $false; hasPopup = $false }
  if ($shown.popup -ne $false) { return ('popup is "{0}"' -f $shown.popup) }
}
Test-Case 'a try-out that names the popup wins over /tokens popup off' {
  $env:TOKEN_USAGE_NOTIFY_POPUP = '1'
  $shown = Invoke-Toast 'ask' @{ session_id = 'test'; tool_input = @{ questions = @(@{ question = 'Deploy?' }) } } @{ isPrivate = $false; hasPopup = $false }
  Remove-Item Env:TOKEN_USAGE_NOTIFY_POPUP
  if ($shown.popup -ne $true) { return ('popup is "{0}"' -f $shown.popup) }
}

# A try-out logs in its own folder: the hooks' log is left as it was.
Test-Case 'a try-out logs in the folder it names, not in the hooks'' log' {
  [void](Invoke-Toast 'notice' @{ session_id = 'test'; title = 'Build finished'; message = 'All green' })
  $log = Join-Path $state 'log.txt'
  if (-not (Test-Path $log) -or -not ((Get-Content $log -Raw) -match 'notice seen')) { return 'nothing was logged in the folder named' }
  $now = if (Test-Path $realLog) { (Get-Item $realLog).Length } else { 0 }
  if ($now -ne $realLength) { return ('the hooks'' log grew by {0} bytes' -f ($now - $realLength)) }
}

Remove-Item $switch -Force -ErrorAction SilentlyContinue
Remove-Item $state -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $sounds -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item Env:TOKEN_USAGE_NOTIFY_DRY, Env:TOKEN_USAGE_NOTIFY_FORCE, Env:TOKEN_USAGE_NOTIFY_FILE, Env:TOKEN_USAGE_NOTIFY_STATE, Env:TOKEN_USAGE_NOTIFY_SOUNDS -ErrorAction SilentlyContinue
if ($failures -gt 0) {
  Write-Output ('{0} failed' -f $failures)
  exit 1
}
Write-Output 'all passed'
