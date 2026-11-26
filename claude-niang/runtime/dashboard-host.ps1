param(
  [string]$ConfigPath='',
  [string]$DataDir='',
  [string]$NodePath='',
  [string]$Version='',
  [string]$Snapshot='',
  [ValidateSet('overview','ledger','overview-end','ledger-end')][string]$View='overview',
  [int]$Width=0,
  [int]$Height=0,
  [switch]$CheckOnly
)
# Claude 娘 · 用量管理：账户总览和用量账本（runtime\dashboard\ 网页，WebView2 显示）。
# 由挂件右键「账户总览」启动，一个独立的小进程；关掉窗口就退出。
#  -Snapshot <png>：不显示窗口，把页面渲染成图片后退出（预览和测试用）
#  -CheckOnly：只检查组件能否加载，输出 JSON
#  -DataDir / -NodePath / -Version：挂件直接传入已知的值，省掉读 JSON 的约 0.3 秒
#  （PowerShell 第一次调用 ConvertFrom-Json 很慢）；不传时从安装配置里读。
$ErrorActionPreference='Stop'
$appDir=Split-Path $PSScriptRoot -Parent
if(!$ConfigPath){$ConfigPath=Join-Path $appDir 'installation.json'}
if(!$DataDir -or !$NodePath){
  $config=[IO.File]::ReadAllText($ConfigPath,[Text.Encoding]::UTF8)|ConvertFrom-Json
  $DataDir=[string]$config.dataDir;$NodePath=[string]$config.nodePath
  try{$Version=[string]([IO.File]::ReadAllText((Join-Path $appDir 'package.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json).version}catch{}
}
$dataDir=$DataDir;$nodePath=$NodePath;$version=$Version
$dataRoot=Split-Path $dataDir -Parent

function Write-DashboardLog([string]$Message){
  try{
    $dir=Join-Path $dataDir 'logs';$null=[IO.Directory]::CreateDirectory($dir)
    $line=[DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss.fff zzz',[Globalization.CultureInfo]::InvariantCulture)+' [dashboard '+$PID+'] '+($Message-replace '\s+',' ')+"`r`n"
    [IO.File]::AppendAllText((Join-Path $dir 'claude-niang.log'),$line,[Text.UTF8Encoding]::new($false))
  }catch{}
}

function Initialize-DashboardTypes {
  $sdk=Join-Path $PSScriptRoot 'webview2'
  $core=Join-Path $sdk 'Microsoft.Web.WebView2.Core.dll'
  $forms=Join-Path $sdk 'Microsoft.Web.WebView2.WinForms.dll'
  $source=Join-Path $PSScriptRoot 'dashboard-host.cs'
  foreach($file in @($core,$forms,$source)){if(!(Test-Path -LiteralPath $file)){throw [IO.FileNotFoundException]::new('missing '+$file)}}
  foreach($file in @(Get-ChildItem -LiteralPath $sdk -Recurse -File -Filter '*.dll' -ErrorAction SilentlyContinue)){try{Unblock-File -LiteralPath $file.FullName -ErrorAction Stop}catch{}}
  Add-Type -AssemblyName System.Windows.Forms,System.Drawing
  if(!('ClaudeNiangAssemblyResolver' -as [type])){
    Import-DashboardAssembly 'assembly-resolver' @'
using System;using System.IO;using System.Reflection;
public static class ClaudeNiangAssemblyResolver {
 static string folder;
 public static void Register(string sdk){
  if(folder!=null)return;
  folder=sdk;
  AppDomain.CurrentDomain.AssemblyResolve+=Resolve;
 }
 static Assembly Resolve(object sender,ResolveEventArgs e){
  string name=new AssemblyName(e.Name).Name;
  if(!name.StartsWith("Microsoft.Web.WebView2",StringComparison.OrdinalIgnoreCase))return null;
  string path=Path.Combine(folder,name+".dll");
  return File.Exists(path)?Assembly.LoadFrom(path):null;
 }
}
'@ @('System.dll')
  }
  [ClaudeNiangAssemblyResolver]::Register($sdk)
  $null=[Reflection.Assembly]::LoadFrom($core)
  $null=[Reflection.Assembly]::LoadFrom($forms)
  if(!('ClaudeNiangDashboard' -as [type])){
    $references=@('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll',$core,$forms)
    Import-DashboardAssembly 'dashboard-host' ([IO.File]::ReadAllText($source,[Text.Encoding]::UTF8)) $references
  }
  [ClaudeNiangDashboard]::PrepareLoader($sdk)
}

# Compile the window (and the small assembly resolver) once and keep the DLL,
# keyed by the source, so opening it does not wait for the C# compiler every
# time. Falls back to in-memory Add-Type.
function Import-DashboardAssembly([string]$Name,[string]$Source,[string[]]$References){
  $cacheDir=Join-Path $dataRoot 'cache';$temp=$null
  try{
    $sha=[Security.Cryptography.SHA256]::Create()
    try{
      $seed=[Text.Encoding]::UTF8.GetBytes(([Environment]::Version.ToString())+'|'+($References-join '|')+'|')
      $key=([BitConverter]::ToString($sha.ComputeHash([byte[]]($seed+[Text.Encoding]::UTF8.GetBytes($Source))))).Replace('-','').Substring(0,24).ToLowerInvariant()
    }finally{$sha.Dispose()}
    $cached=Join-Path $cacheDir ($Name+'-'+$key+'.dll')
    if(!(Test-Path -LiteralPath $cached)){
      $null=[IO.Directory]::CreateDirectory($cacheDir)
      $temp=Join-Path $cacheDir ('build-'+[Guid]::NewGuid().ToString('N')+'.dll')
      $provider=New-Object Microsoft.CSharp.CSharpCodeProvider
      try{
        $parameters=New-Object System.CodeDom.Compiler.CompilerParameters
        foreach($reference in $References){$null=$parameters.ReferencedAssemblies.Add($reference)}
        $parameters.OutputAssembly=$temp;$parameters.GenerateInMemory=$false;$parameters.CompilerOptions='/optimize+'
        $result=$provider.CompileAssemblyFromSource($parameters,$Source)
        if($result.Errors.HasErrors){throw ((@($result.Errors|Where-Object{!$_.IsWarning}|ForEach-Object{$_.ToString()}))-join "`n")}
      }finally{$provider.Dispose()}
      try{[IO.File]::Move($temp,$cached);$temp=$null}catch{if(!(Test-Path -LiteralPath $cached)){throw}}
    }
    $null=[Reflection.Assembly]::LoadFrom($cached)
  }catch{
    if($_.Exception.Message-match 'error CS'){throw}
    Add-Type -IgnoreWarnings -ReferencedAssemblies $References -TypeDefinition $Source
  }finally{if($temp -and (Test-Path -LiteralPath $temp)){Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue}}
}

try{Initialize-DashboardTypes}catch{Write-DashboardLog ('用量管理窗口组件加载失败：'+$_.Exception.Message);throw}
if($CheckOnly){[pscustomobject]@{ok=$true;version=$version;page=(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dashboard\index.html'))}|ConvertTo-Json -Compress;return}

$mutex=$null
if(!$Snapshot){
  $owned=$false
  $mutex=[Threading.Mutex]::new($true,'Local\ClaudeNiangDashboard',[ref]$owned)
  if(!$owned){$null=[ClaudeNiangDashboard]::ActivateExisting();$mutex.Dispose();return}
}
try{
  [ClaudeNiangDashboard]::SetAppIdentity()
  [ClaudeNiangDashboard]::EnableDpiAwareness()
  [Windows.Forms.Application]::EnableVisualStyles()
  $profileDir=Join-Path $dataRoot 'webview-dashboard'
  $form=[ClaudeNiangDashboard]::new($appDir,$dataDir,[IO.Path]::GetFullPath($ConfigPath),$nodePath,$profileDir,$version,$Snapshot,$View,$Width,$Height)
  [Windows.Forms.Application]::Run($form)
  if($Snapshot){
    if($form.Failure){[Console]::Error.WriteLine($form.Failure);exit 1}
    if(!(Test-Path -LiteralPath $Snapshot)){[Console]::Error.WriteLine('snapshot not written');exit 1}
  }elseif($form.Failure){Write-DashboardLog ('用量管理窗口没能显示：'+$form.Failure)}
}catch{
  # The window runs without a console: leave the reason in the widget's log.
  Write-DashboardLog ('用量管理窗口出错：'+$_.Exception.Message)
  throw
}finally{if($mutex){$mutex.ReleaseMutex();$mutex.Dispose()}}
