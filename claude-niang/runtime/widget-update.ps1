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

function Get-WidgetUpdateNoticeText($Result){
  $version='v'+[string]$Result.latest
  if($Result.prerelease){return "测试版 $version 出炉啦～`n想尝鲜的话，右键「关于 Claude娘」看看？"}
  return "新版本 $version 到啦～`n才、才不是特意来告诉你的！"
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
# A long strip card: title, one line of explanation, and a state on the right.
function New-WidgetUpdateCard([string]$Title,[string]$Detail,[string]$Glyph){
  $converter=[Windows.Media.BrushConverter]::new()
  $card=New-Object Windows.Controls.Border;$card.CornerRadius=[Windows.CornerRadius]::new(10);$card.BorderThickness=[Windows.Thickness]::new(1)
  $card.BorderBrush=$converter.ConvertFromString('#F0E1D7');$card.Background=$converter.ConvertFromString('#FFF8F4');$card.Padding=[Windows.Thickness]::new(11,9,11,9);$card.Margin=[Windows.Thickness]::new(-4,1,-4,1)
  $grid=New-Object Windows.Controls.Grid
  foreach($width in @([Windows.GridLength]::Auto,[Windows.GridLength]::new(1,[Windows.GridUnitType]::Star),[Windows.GridLength]::Auto)){$c=New-Object Windows.Controls.ColumnDefinition;$c.Width=$width;$grid.ColumnDefinitions.Add($c)|Out-Null}
  $icon=New-Object Windows.Controls.Border;$icon.Width=30;$icon.Height=30;$icon.CornerRadius=[Windows.CornerRadius]::new(8);$icon.Background=$converter.ConvertFromString('#F8E6DC');$icon.Margin=[Windows.Thickness]::new(0,0,10,0);$icon.VerticalAlignment='Center'
  $mark=New-SettingsText $Glyph 15 '#C0613E';$mark.HorizontalAlignment='Center';$mark.VerticalAlignment='Center';$icon.Child=$mark
  $text=New-Object Windows.Controls.StackPanel;$text.VerticalAlignment='Center';[Windows.Controls.Grid]::SetColumn($text,1)
  $main=New-SettingsText $Title 14 '#4A3328';$main.FontWeight=[Windows.FontWeights]::SemiBold
  $sub=New-SettingsText $Detail 11.5 '#A68B7C';$sub.TextWrapping=[Windows.TextWrapping]::Wrap;$sub.Margin=[Windows.Thickness]::new(0,2,0,0)
  $text.Children.Add($main)|Out-Null;$text.Children.Add($sub)|Out-Null
  $state=New-SettingsText '' 12 '#C0613E';$state.FontWeight=[Windows.FontWeights]::SemiBold;$state.VerticalAlignment='Center';$state.Margin=[Windows.Thickness]::new(8,0,0,0);[Windows.Controls.Grid]::SetColumn($state,2)
  $grid.Children.Add($icon)|Out-Null;$grid.Children.Add($text)|Out-Null;$grid.Children.Add($state)|Out-Null;$card.Child=$grid
  return @{Card=$card;State=$state;Detail=$sub}
}
function Add-WidgetUpdateMenu {
  $script:settingsMenuUi.About=Add-SettingsSubmenu '关于 Claude娘' {
    $head=New-WidgetUpdateCard ('Claude娘 v'+$script:appVersion) '社区维护版 · 基于 GPT 娘 (MIT)' '✦'
    $head.Card.Background=[Windows.Media.BrushConverter]::new().ConvertFromString('#FDF0E9')
    $script:settingsMenuUi.AboutHead=$head;Add-SettingsPanel $head.Card -Passive
    Add-SettingsSection '更新'
    $check=New-WidgetUpdateCard '检查更新' '立即向 GitHub 查询有没有新版本' '↻'
    $script:settingsMenuUi.UpdateCheck=Add-WidgetUpdateCardItem $check {Start-WidgetManualUpdateCheck;$script:context.IsOpen=$false}
    $auto=New-WidgetUpdateCard '自动更新' '每次启动挂件时检查一次，有新版本时 Claude娘会提醒你' '⚙'
    $script:settingsMenuUi.UpdateAuto=$auto
    $null=Add-WidgetUpdateCardItem $auto {$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings (!$s.AutoCheck) $s.Beta}} -StayOpen
    Add-SettingsSection '更新范围'
    $stable=New-WidgetUpdateCard '正式版（默认）' '只提示正式发布的版本' '●'
    $beta=New-WidgetUpdateCard '测试版' '包含测试版，总是提示最新的那个' '◆'
    $script:settingsMenuUi.UpdateStable=$stable;$script:settingsMenuUi.UpdateBeta=$beta
    $null=Add-WidgetUpdateCardItem $stable {$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings $s.AutoCheck $false}} -StayOpen
    $null=Add-WidgetUpdateCardItem $beta {$s=Get-WidgetUpdateSettings;if($s){Set-WidgetUpdateSettings $s.AutoCheck $true}} -StayOpen
    $hint=New-SettingsText '只读取 GitHub 上公开的版本列表，不会自动下载或安装。' 11.5 '#9A7766'
    $hint.TextWrapping=[Windows.TextWrapping]::Wrap;$hint.Margin=[Windows.Thickness]::new(0,6,0,2);Add-SettingsPanel $hint -Passive
  } -ReturnItem
}
function Add-WidgetUpdateCardItem($Card,[scriptblock]$Action,[switch]$StayOpen){
  $item=Add-SettingsPanel $Card.Card -ReturnItem
  $item.StaysOpenOnClick=[bool]$StayOpen;$item.Padding=[Windows.Thickness]::new(6,1,6,1);$item.Add_Click($Action)
  return $item
}
function Update-WidgetUpdateMenu {
  if(!$script:settingsMenuUi.UpdateAuto){return}
  $s=Get-WidgetUpdateSettings
  if(!$s){$script:settingsMenuUi.UpdateAuto.State.Text='—';return}
  $script:settingsMenuUi.UpdateAuto.State.Text=if($s.AutoCheck){'已开启'}else{'已关闭'}
  $script:settingsMenuUi.UpdateAuto.State.Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString($(if($s.AutoCheck){'#C0613E'}else{'#A3958C'}))
  $script:settingsMenuUi.UpdateStable.State.Text=if($s.Beta){''}else{'✓ 当前'}
  $script:settingsMenuUi.UpdateBeta.State.Text=if($s.Beta){'✓ 当前'}else{''}
  $script:settingsMenuUi.AboutHead.Detail.Text='社区维护版 · 更新范围：'+$(if($s.Beta){'测试版'}else{'正式版'})+' · 基于 GPT 娘 (MIT)'
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
