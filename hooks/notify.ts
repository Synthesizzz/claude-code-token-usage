import type { Notice } from '../types'

// A notice outside the app, as Windows draws one: a title, a line of text and
// a bar. PowerShell raises it, under the Claude app where that is installed.

// The script is fixed text. What a notice says reaches it through the
// environment and is escaped there, so no word of a notice is ever code.
export const TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
  '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]',
  'function Esc($value) { [System.Security.SecurityElement]::Escape([string]$value) }',
  "$bar = ''",
  'if ($env:TOKEN_USAGE_BAR_NAME) {',
  '  $bar = \'<progress title="{0}" value="{1}" valueStringOverride="{2}" status="{3}"/>\' -f (Esc $env:TOKEN_USAGE_BAR_NAME), (Esc $env:TOKEN_USAGE_BAR_VALUE), (Esc $env:TOKEN_USAGE_BAR_LABEL), (Esc $env:TOKEN_USAGE_BAR_STATUS)',
  '}',
  '$xml = \'<toast><visual><binding template="ToastGeneric"><text>{0}</text><text>{1}</text>{2}</binding></visual></toast>\' -f (Esc $env:TOKEN_USAGE_TITLE), (Esc $env:TOKEN_USAGE_TEXT), $bar',
  '$doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
  '$doc.LoadXml($xml)',
  "$app = (Get-StartApps | Where-Object { $_.Name -eq 'Claude' } | Select-Object -First 1).AppID",
  "if (-not $app) { $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe' }",
  '$toast = New-Object Windows.UI.Notifications.ToastNotification $doc',
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)',
].join('\n')

export const toastArgv = ['powershell', '-NoProfile', '-NonInteractive', '-Command', TOAST_SCRIPT]

export const toastEnv = ({ title, text, bar }: Notice): Record<string, string> => ({
  TOKEN_USAGE_TITLE: title,
  TOKEN_USAGE_TEXT: text,
  TOKEN_USAGE_BAR_NAME: bar.name,
  TOKEN_USAGE_BAR_VALUE: String(bar.value),
  TOKEN_USAGE_BAR_LABEL: bar.label,
  TOKEN_USAGE_BAR_STATUS: bar.status,
})

// One line for a channel that draws text alone.
export const spoken = ({ title, text }: Notice) => (text === '' ? title : `${title}. ${text}`)
