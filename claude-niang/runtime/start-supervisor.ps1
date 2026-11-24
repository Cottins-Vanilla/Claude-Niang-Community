$ErrorActionPreference='Stop'
$appDir=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'supervisor-task.ps1')
. (Join-Path $PSScriptRoot 'log.ps1')
try{
  $info=Get-WidgetSupervisorInfo $appDir
  $launch=Resolve-WidgetSupervisorLaunch $appDir
  if($launch.Kind-eq 'headless'){Write-WidgetLog $info.DataDir 'supervisor' ('启动程序无法运行，改用 conhost 隐藏启动：'+$launch.Reason)}
  # Registrations from earlier versions start a visible PowerShell or depend on
  # VBScript, and policy may block the launcher later; opening Claude娘 moves
  # this folder's registration to the launch form that works now.
  $shortcut=[string](Read-WidgetJsonFile (Join-Path $appDir 'installation.json')).startupShortcut
  $installed=Get-WidgetSupervisorTask $info
  if($installed -and (Test-WidgetSupervisorTaskCurrent $installed $launch)){Start-WidgetSupervisorTask $appDir;$hasTask=$true}
  else{$hasTask=[bool](Register-WidgetSupervisorTask $appDir).TaskRegistered}
  # With a working task the Startup shortcut is removed (antivirus flags its form);
  # without one it is the fallback for the next sign-in.
  $startup=Sync-WidgetStartupShortcut $shortcut $info.AppDir $hasTask
  if($startup-in @('removed','created')){Write-WidgetLog $info.DataDir 'supervisor' ('启动文件夹快捷方式：'+$(if($startup-eq 'removed'){'计划任务可用，已移除'}else{'计划任务不可用，已创建'}))}
}catch{
  $failure=$_
  try{$configuration=Get-Content -LiteralPath (Join-Path $appDir 'installation.json') -Raw -Encoding UTF8|ConvertFrom-Json;Write-WidgetLog $configuration.dataDir 'supervisor' ('计划任务没能启动监督进程，改为直接运行：'+$failure.Exception.Message)}catch{}
  # No working task: keep the Startup shortcut as the fallback for the next sign-in.
  try{Sync-WidgetStartupShortcut ([string]$configuration.startupShortcut) $appDir $false|Out-Null}catch{}
  # Last resort: run the supervisor directly, as the Startup shortcut does.
  try{$fallback=Get-WidgetSupervisorInfo $appDir;Resume-WidgetSupervisor $appDir;Start-WidgetSupervisorProcess $fallback}catch{throw $failure}
}
