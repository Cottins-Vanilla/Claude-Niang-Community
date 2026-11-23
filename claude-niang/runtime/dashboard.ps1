# 右键「账户总览」：打开用量管理窗口（runtime\dashboard-host.ps1，独立的小进程）。
# 窗口已经开着时，那个进程会把已有窗口切到前面，不会开第二个。
function Open-WidgetDashboard {
  $hostScript=Join-Path $script:appDir 'runtime\dashboard-host.ps1'
  $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments=@('-NoLogo','-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$hostScript+'"'),'-ConfigPath',('"'+$script:configPath+'"'))
  try{$null=Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru}
  catch{Write-WidgetLog $script:dataDir 'widget' ('用量管理窗口没能启动：'+$_.Exception.Message)}
}