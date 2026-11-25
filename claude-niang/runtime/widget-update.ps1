# Updates (runtime\update-check.cs does the network part).
# - At widget start: once per widget process, when Claude Niang first appears,
#   ask GitHub in the background whether a newer release exists for the chosen
#   range (formal / beta). A newer one gets a 5-second bubble.
# - Right-click → 关于 Claude娘: check now (a small card in the bottom-right
#   corner), automatic check on/off, update range.
# Nothing is downloaded: "是" opens the release page in the browser.
$script:updateCheck=@{state='idle';task=$null}
$script:updateCard=$null;$script:updateManual=$null

function Initialize-WidgetUpdateType {
  Add-WidgetType -TypeName ClaudeNiangUpdate -Path (Join-Path $script:appDir 'runtime\update-check.cs') -ReferencedAssemblies @('System.Runtime.Serialization','System.Xml')
}
function Get-WidgetUpdateSettings {
  try{Initialize-WidgetUpdateType;return [ClaudeNiangUpdate]::LoadSettings($script:dataDir)}catch{return $null}
}
function Set-WidgetUpdateSettings([bool]$AutoCheck,[bool]$Beta){
  try{Initialize-WidgetUpdateType;[ClaudeNiangUpdate]::SaveSettings($script:dataDir,$AutoCheck,$Beta)}
  catch{Write-WidgetLog $script:dataDir 'widget' ('更新设置没能保存：'+$_.Exception.Message)}
  Update-WidgetUpdateMenu
}

# One line for every newer release, formal or beta.
function Get-WidgetUpdateNoticeText($Result){
  return "新版本到啦～`n才、才不是特意来告诉你的！"
}

# --- automatic check at start ------------------------------------------------------
function Tick-WidgetUpdateCheck([bool]$Visible){
  $check=$script:updateCheck
  if($check.state-eq 'idle'){
    if(!$Visible){return}
    try{
      Initialize-WidgetUpdateType
      $settings=[ClaudeNiangUpdate]::LoadSettings($script:dataDir)
      if(!$settings.AutoCheck){$check.state='off';return}
      $check.task=[ClaudeNiangUpdate]::CheckAsync([string]$script:appVersion,[bool]$settings.Beta,15000);$check.state='running'
    }catch{$check.state='failed';Write-WidgetLog $script:dataDir 'widget' ('检查更新没能开始：'+$_.Exception.Message)}
    return
  }
  if($check.state-ne 'running' -or !$check.task.IsCompleted){return}
  $check.state='done'
  $result=Receive-WidgetUpdateResult $check.task;$check.task=$null
  if($result -and $result.ok -and $result.newer){Show-WidgetNotice (Get-WidgetUpdateNoticeText $result)}
}
function Receive-WidgetUpdateResult($Task){
  try{$result=$Task.Result|ConvertFrom-Json}catch{Write-WidgetLog $script:dataDir 'widget' ('检查更新出错：'+$_.Exception.Message);return $null}
  finally{try{$Task.Dispose()}catch{}}
  if(!$result.ok){Write-WidgetLog $script:dataDir 'widget' ('检查更新没有完成：'+[string]$result.error)}
  else{Write-WidgetLog $script:dataDir 'widget' ('检查更新：当前 '+[string]$result.current+'，'+$(if($result.channel-eq 'beta'){'含测试版'}else{'正式版'})+'最新 '+[string]$result.latest)}
  return $result
}

# --- right-click → 关于 Claude娘 ------------------------------------------------------
# Built from the same menu items as the other submenus (自动语录, 显示与位置).
function Add-WidgetUpdateMenu {
  $script:settingsMenuUi.About=Add-SettingsSubmenu '关于 Claude娘' {
    $script:settingsMenuUi.AboutVersion=Add-SettingsAction ('Claude娘 v'+$script:appVersion) {} -Description '社区维护版 · 基于 GPT 娘 (MIT)' -ReturnItem
    $script:settingsMenuUi.AboutVersion.IsHitTestVisible=$false;$script:settingsMenuUi.AboutVersion.Focusable=$false
    Add-SettingsDivider
    $script:settingsMenuUi.UpdateCheck=Add-SettingsAction '检查更新' {Start-WidgetManualUpdateCheck;$script:context.IsOpen=$false} -ReturnItem
    $script:settingsMenuUi.UpdateAuto=Add-SettingsAction '自动更新' {param($sender,$event)if($script:settingsMenuSync){return};$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings ([bool]$sender.IsChecked) $s.Beta};Update-WidgetSettingsMenu} -Description '每次启动挂件时检查一次' -Checkable -ReturnItem
    Add-SettingsDivider
    Add-SettingsSection '更新范围'
    $script:settingsMenuUi.UpdateStable=Add-SettingsAction '正式版（默认）' {$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings $s.AutoCheck $false};Update-WidgetSettingsMenu} -Checkable -ReturnItem
    $script:settingsMenuUi.UpdateBeta=Add-SettingsAction '测试版' {$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings $s.AutoCheck $true};Update-WidgetSettingsMenu} -Checkable -ReturnItem
    $script:settingsMenuUi.UpdateStable.Uid='radio';$script:settingsMenuUi.UpdateBeta.Uid='radio'
    $hint=New-SettingsText '只读取 GitHub 上公开的版本列表，不会自动下载或安装。' 11.5 '#9A7766'
    $hint.TextWrapping=[Windows.TextWrapping]::Wrap;$hint.Margin=[Windows.Thickness]::new(0,8,0,0)
    Add-SettingsPanel $hint -Passive
  } -ReturnItem
}
function Update-WidgetUpdateMenu {
  if(!$script:settingsMenuUi.UpdateAuto){return}
  $s=Get-WidgetUpdateSettings
  $ok=[bool]$s
  foreach($item in @($script:settingsMenuUi.UpdateAuto,$script:settingsMenuUi.UpdateStable,$script:settingsMenuUi.UpdateBeta)){$item.IsEnabled=$ok}
  if(!$ok){return}
  $script:settingsMenuUi.UpdateAuto.IsChecked=[bool]$s.AutoCheck
  $script:settingsMenuUi.UpdateStable.IsChecked=![bool]$s.Beta
  $script:settingsMenuUi.UpdateBeta.IsChecked=[bool]$s.Beta
}

# --- manual check and the bottom-right card ------------------------------------------
function Start-WidgetManualUpdateCheck {
  if($script:updateManual){Show-WidgetUpdateCard 'checking' $null;return}
  try{
    Initialize-WidgetUpdateType
    $settings=[ClaudeNiangUpdate]::LoadSettings($script:dataDir)
    $script:updateManual=[ClaudeNiangUpdate]::CheckAsync([string]$script:appVersion,[bool]$settings.Beta,15000)
  }catch{Show-WidgetUpdateCard 'error' ([pscustomobject]@{error=$_.Exception.Message});return}
  Show-WidgetUpdateCard 'checking' $null
  $timer=New-Object Windows.Threading.DispatcherTimer;$timer.Interval=[TimeSpan]::FromMilliseconds(120)
  $timer.Add_Tick({param($sender,$event)
    if(!$script:updateManual -or !$script:updateManual.IsCompleted){return}
    $sender.Stop()
    $result=Receive-WidgetUpdateResult $script:updateManual;$script:updateManual=$null
    if(!$result){Show-WidgetUpdateCard 'error' ([pscustomobject]@{error='检查更新出错了'})}
    elseif(!$result.ok){Show-WidgetUpdateCard 'error' $result}
    elseif($result.newer){Show-WidgetUpdateCard 'newer' $result}
    else{Show-WidgetUpdateCard 'latest' $result}
  })
  $timer.Start()
}

function Close-WidgetUpdateCard([switch]$Now){
  $card=$script:updateCard;if(!$card){return}
  $script:updateCard=$null
  try{$card.Timer.Stop()}catch{}
  if($Now){try{$card.Window.Close()}catch{};return}
  # Transition out: fade and drop a little, then close.
  $ease=New-Object Windows.Media.Animation.CubicEase;$ease.EasingMode='EaseIn'
  $fade=New-Object Windows.Media.Animation.DoubleAnimation(1,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(320)));$fade.EasingFunction=$ease
  $drop=New-Object Windows.Media.Animation.DoubleAnimation(0,14,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(320)));$drop.EasingFunction=$ease
  $window=$card.Window
  $fade.Add_Completed({try{$window.Close()}catch{}}.GetNewClosure())
  $card.Root.BeginAnimation([Windows.UIElement]::OpacityProperty,$fade)
  $card.Shift.BeginAnimation([Windows.Media.TranslateTransform]::YProperty,$drop)
}

function Show-WidgetUpdateCard([ValidateSet('checking','latest','newer','error')][string]$State,$Result){
  if(!$script:updateCard){$script:updateCard=New-WidgetUpdateCardWindow}
  $card=$script:updateCard
  $version=if($Result -and $Result.latest){'v'+[string]$Result.latest}else{''}
  switch($State){
    'checking'{$card.Title.Text='正在检查更新…';$card.Text.Text='稍等一下，我去 GitHub 看看～';$card.Glyph.Text='↻'}
    'latest'{$card.Title.Text='已经是最新版本';$card.Text.Text='当前 v'+$script:appVersion+'，'+$(if($Result.channel-eq 'beta'){'含测试版'}else{'正式版'})+'里没有更新的了。';$card.Glyph.Text='✓'}
    'newer'{$card.Title.Text=$(if($Result.prerelease){'发现测试版 '}else{'发现新版本 '})+$version;$card.Text.Text='当前 v'+$script:appVersion+'。要去发布页下载吗？';$card.Glyph.Text='✦'}
    'error'{$card.Title.Text='检查更新没有完成';$card.Text.Text=[string]$Result.error;$card.Glyph.Text='!'}
  }
  $card.Actions.Visibility=if($State-eq 'newer'){'Visible'}else{'Collapsed'}
  $card.Url=if($State-eq 'newer'){[string]$Result.url}else{''}
  $card.Window.UpdateLayout();Set-WidgetUpdateCardPosition $card
  $card.Timer.Stop()
  if($State-ne 'checking'){
    $card.Timer.Interval=[TimeSpan]::FromMilliseconds($(if($State-eq 'newer'){4500}else{2500}))
    $card.Timer.Start()
  }
}

function New-WidgetUpdateCardWindow {
  $window=[Windows.Markup.XamlReader]::Parse(@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="False" ShowActivated="False"
 ResizeMode="NoResize" SizeToContent="WidthAndHeight" FontFamily="Microsoft YaHei UI" Title="Claude 娘 · 检查更新">
 <Grid x:Name="Root" Margin="18">
  <Grid.RenderTransform><TranslateTransform x:Name="Shift"/></Grid.RenderTransform>
  <Border Width="340" Background="#FFFFFF" BorderBrush="#EBD9CE" BorderThickness="1" CornerRadius="14" Padding="16,14,16,14">
   <Border.Effect><DropShadowEffect BlurRadius="22" ShadowDepth="5" Direction="270" Opacity="0.16" Color="#4A2E1E"/></Border.Effect>
   <StackPanel>
    <Grid>
     <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
     <Border Width="44" Height="44" CornerRadius="12" BorderBrush="#F0D9CD" BorderThickness="1" Margin="0,0,12,0" VerticalAlignment="Top">
      <Border.Background><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#FDF3EE" Offset="0"/><GradientStop Color="#F5DFD3" Offset="1"/></LinearGradientBrush></Border.Background>
      <Grid><Image x:Name="Face" Margin="3" Stretch="Uniform"/>
       <Border Width="18" Height="18" CornerRadius="9" Background="#C6613F" HorizontalAlignment="Right" VerticalAlignment="Bottom" Margin="0,0,-5,-5">
        <TextBlock x:Name="Glyph" Text="↻" Foreground="White" FontSize="11" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border></Grid>
     </Border>
     <StackPanel Grid.Column="1" VerticalAlignment="Center">
      <TextBlock x:Name="Title" FontSize="15" FontWeight="SemiBold" Foreground="#2C2521" TextWrapping="Wrap"/>
      <TextBlock x:Name="Text" FontSize="12.5" Foreground="#6E635A" Margin="0,3,0,0" TextWrapping="Wrap"/>
     </StackPanel>
    </Grid>
    <StackPanel x:Name="Actions" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,12,0,0" Visibility="Collapsed">
     <Button x:Name="No" Content="否" Width="64" Height="32" Margin="0,0,8,0" Cursor="Hand">
      <Button.Template><ControlTemplate TargetType="Button"><Border x:Name="B" Background="#FFFFFF" BorderBrush="#DDD3CA" BorderThickness="1" CornerRadius="8"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" TextElement.Foreground="#6E635A" TextElement.FontSize="13"/></Border>
       <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="B" Property="Background" Value="#FAF7F4"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Button.Template></Button>
     <Button x:Name="Yes" Content="是，去更新" Width="104" Height="32" Cursor="Hand">
      <Button.Template><ControlTemplate TargetType="Button"><Border x:Name="B" Background="#C6613F" CornerRadius="8"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" TextElement.Foreground="#FFFFFF" TextElement.FontSize="13" TextElement.FontWeight="SemiBold"/></Border>
       <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="B" Property="Background" Value="#B3532F"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Button.Template></Button>
    </StackPanel>
   </StackPanel>
  </Border>
 </Grid>
</Window>
'@)
  $card=@{Window=$window;Root=$window.FindName('Root');Shift=$window.FindName('Shift');Title=$window.FindName('Title');Text=$window.FindName('Text');Glyph=$window.FindName('Glyph');Actions=$window.FindName('Actions');Url=''}
  try{$card.Face=$window.FindName('Face');$card.Face.Source=[Windows.Media.Imaging.BitmapImage]::new([Uri]::new((Join-Path $script:appDir 'assets\claude-niang.png')))}catch{}
  $card.Timer=New-Object Windows.Threading.DispatcherTimer
  $card.Timer.Add_Tick({param($sender,$event)$sender.Stop();Close-WidgetUpdateCard})
  $window.FindName('No').Add_Click({Close-WidgetUpdateCard})
  $window.FindName('Yes').Add_Click({
    $url=if($script:updateCard){[string]$script:updateCard.Url}else{''}
    if($url.StartsWith([ClaudeNiangUpdate]::ReleasesPage,[StringComparison]::Ordinal)){try{Start-Process $url}catch{Write-WidgetLog $script:dataDir 'widget' ('发布页没能打开：'+$_.Exception.Message)}}
    Close-WidgetUpdateCard
  })
  # Transition in: fade and rise.
  $card.Root.Opacity=0;$card.Shift.Y=14
  $window.Add_ContentRendered({param($sender,$event)
    $root=$sender.FindName('Root');$shift=$sender.FindName('Shift')
    $ease=New-Object Windows.Media.Animation.CubicEase;$ease.EasingMode='EaseOut'
    $fade=New-Object Windows.Media.Animation.DoubleAnimation(0,1,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(220)));$fade.EasingFunction=$ease
    $rise=New-Object Windows.Media.Animation.DoubleAnimation(14,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(220)));$rise.EasingFunction=$ease
    $root.BeginAnimation([Windows.UIElement]::OpacityProperty,$fade);$shift.BeginAnimation([Windows.Media.TranslateTransform]::YProperty,$rise)
  })
  $window.Left=-10000;$window.Top=-10000;$window.Show()
  return $card
}

# Bottom-right corner of the screen Claude Niang is on; moved to her left when
# the corner is where she stands, so the card never covers her.
function Set-WidgetUpdateCardPosition($Card){
  $window=$Card.Window
  $dpi=1.0;try{$dpi=[Windows.Media.VisualTreeHelper]::GetDpi($script:window).DpiScaleX}catch{}
  $screen=[Windows.Forms.Screen]::FromHandle($script:widgetHandle)
  $area=$screen.WorkingArea
  $w=$window.ActualWidth;$h=$window.ActualHeight
  $left=$area.Right/$dpi-$w;$top=$area.Bottom/$dpi-$h
  if($script:window.IsVisible){
    $wl=$script:window.Left;$wt=$script:window.Top;$wr=$wl+$script:window.ActualWidth;$wb=$wt+$script:window.ActualHeight
    if($left-lt $wr -and $left+$w-gt $wl -and $top-lt $wb -and $top+$h-gt $wt){$left=[Math]::Max($area.Left/$dpi,$wl-$w)}
  }
  $window.Left=$left;$window.Top=$top
}
