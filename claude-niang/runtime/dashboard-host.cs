// Claude 娘 · 用量管理 window. Compiled at runtime by dashboard-host.ps1 (C# 5).
// Shows runtime/dashboard/index.html in WebView2 and feeds it local files:
//   status.json / org-snapshots.json (the widget's worker) and usage-index.json
//   (runtime/local-usage.mjs, re-run here every 20 seconds while the window is open).
// The page can ask for: refresh (a quota read of the selected organization,
// exactly like clicking the widget), focus-claude, login, open the claude.ai
// usage page, and saving an export. Nothing else leaves the window; it uses
// its own browser profile, separate from the claude.ai sign-in.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

public sealed class ClaudeNiangDashboard : Form {
  public const string WindowTitle = "Claude 娘 · 用量管理";
  const string Host = "claude-niang.local";

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadLibraryW(string path);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
  [DllImport("user32.dll")] static extern IntPtr SendMessageW(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

  readonly string appDir, dataDir, configPath, nodePath, profileDir, snapshotPath, startView, version;
  readonly Microsoft.Web.WebView2.WinForms.WebView2 view;
  readonly Timer tick;
  string stateStamp = "", usageStamp = "";
  bool ready;
  Process scan;
  DateTime lastScan = DateTime.MinValue;
  IntPtr bigIcon = IntPtr.Zero, smallIcon = IntPtr.Zero;
  public string Failure { get; private set; }

  public static void PrepareLoader(string sdkDir) {
    string arch = (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "").ToUpperInvariant();
    string dir = Path.Combine(sdkDir, arch == "ARM64" ? "arm64" : arch == "X86" ? "x86" : "x64");
    string loader = Path.Combine(dir, "WebView2Loader.dll");
    if (!File.Exists(loader)) throw new FileNotFoundException("WebView2Loader.dll is missing", loader);
    try { CoreWebView2Environment.SetLoaderDllFolderPath(dir); } catch (Exception) { }
    LoadLibraryW(loader);
  }
  public static void EnableDpiAwareness() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { } }
  // Its own taskbar identity: without it Windows groups the window under
  // powershell.exe and shows the PowerShell icon. Call before any window exists.
  public static void SetAppIdentity() { try { SetCurrentProcessExplicitAppUserModelID("ClaudeNiang.UsageWindow"); } catch (Exception) { } }

  // Claude Niang's face on the sidebar's peach tile, drawn at the size Windows asks for.
  static IntPtr MakeIcon(Image source, int size) {
    using (Bitmap bitmap = new Bitmap(size, size))
    using (Graphics g = Graphics.FromImage(bitmap)) {
      g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
      g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
      float r = size * 0.24f;
      using (System.Drawing.Drawing2D.GraphicsPath tile = new System.Drawing.Drawing2D.GraphicsPath()) {
        tile.AddArc(0, 0, r * 2, r * 2, 180, 90); tile.AddArc(size - r * 2 - 1, 0, r * 2, r * 2, 270, 90);
        tile.AddArc(size - r * 2 - 1, size - r * 2 - 1, r * 2, r * 2, 0, 90); tile.AddArc(0, size - r * 2 - 1, r * 2, r * 2, 90, 90);
        tile.CloseFigure();
        using (System.Drawing.Drawing2D.LinearGradientBrush peach = new System.Drawing.Drawing2D.LinearGradientBrush(new Point(0, 0), new Point(size, size), Color.FromArgb(253, 243, 238), Color.FromArgb(242, 214, 199)))
          g.FillPath(peach, tile);
        g.SetClip(tile);
        // The whole character, inset like the sidebar's logo: nothing of her is cropped.
        int inset = Math.Max(1, (int)Math.Round(size * 0.08));
        g.DrawImage(source, new Rectangle(inset, inset, size - inset * 2, size - inset * 2), new Rectangle(0, 0, source.Width, source.Height), GraphicsUnit.Pixel);
      }
      return bitmap.GetHicon();
    }
  }
  // A second "open" brings the existing window forward instead of opening another.
  public static bool ActivateExisting() {
    IntPtr hwnd = FindWindowW(null, WindowTitle);
    if (hwnd == IntPtr.Zero) return false;
    if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
    SetForegroundWindow(hwnd);
    return true;
  }

  public ClaudeNiangDashboard(string appDir, string dataDir, string configPath, string nodePath, string profileDir, string version, string snapshotPath, string startView, int width, int height) {
    this.appDir = appDir; this.dataDir = dataDir; this.configPath = configPath; this.nodePath = nodePath;
    this.profileDir = profileDir; this.version = version ?? ""; this.snapshotPath = snapshotPath ?? ""; this.startView = startView ?? "overview";
    Text = WindowTitle;
    BackColor = Color.FromArgb(250, 248, 245);
    StartPosition = FormStartPosition.Manual;
    MinimumSize = new Size(900, 600);
    try {
      using (Image image = Image.FromFile(Path.Combine(appDir, @"assets\claude-niang.png"))) {
        bigIcon = MakeIcon(image, 64);
        smallIcon = MakeIcon(image, 32);
      }
      Icon = Icon.FromHandle(bigIcon);
    } catch (Exception) { }
    view = new Microsoft.Web.WebView2.WinForms.WebView2();
    view.Dock = DockStyle.Fill;
    view.DefaultBackgroundColor = BackColor;
    Controls.Add(view);
    if (snapshotPath.Length > 0) {
      ShowInTaskbar = false;
      Bounds = new Rectangle(-30000, -30000, width > 0 ? width : 1280, height > 0 ? height : 900);
    } else {
      FitToScreen(width, height);
    }
    tick = new Timer();
    tick.Interval = 1000;
    tick.Tick += delegate { Pump(); };
  }

  void FitToScreen(int width, int height) {
    float scale = 1f;
    try { using (Graphics g = CreateGraphics()) scale = Math.Max(1f, g.DpiX / 96f); } catch (Exception) { }
    Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
    int w = Math.Min(width > 0 ? width : (int)(1240 * scale), area.Width - 40);
    int h = Math.Min(height > 0 ? height : (int)(860 * scale), area.Height - 40);
    Bounds = new Rectangle(area.Left + (area.Width - w) / 2, area.Top + (area.Height - h) / 2, w, h);
  }

  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    try {
      // Taskbar, Alt+Tab and title icons: both sizes, so none falls back to PowerShell's.
      if (smallIcon != IntPtr.Zero) SendMessageW(Handle, 0x80, IntPtr.Zero, smallIcon);
      if (bigIcon != IntPtr.Zero) SendMessageW(Handle, 0x80, new IntPtr(1), bigIcon);
      // Windows 11: light mode, rounded corners and a border in the page's line color.
      int off = 0, round = 2, border = 0x00D6DDE5;
      DwmSetWindowAttribute(Handle, 20, ref off, 4);
      DwmSetWindowAttribute(Handle, 33, ref round, 4);
      DwmSetWindowAttribute(Handle, 34, ref border, 4);
      // Apply the caption-less frame (see WndProc) right away.
      SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027);
    } catch (Exception) { }
  }

  // No system title bar: the page header is the title bar (CSS app-region: drag),
  // with its own minimize / maximize / close buttons. The native frame stays for
  // resizing, snapping and the shadow; only the caption height is taken away.
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0083 && m.WParam != IntPtr.Zero && snapshotPath.Length == 0) {
      RECT before = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
      base.WndProc(ref m);
      RECT after = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
      // Maximized windows hang over the screen edge by the frame; keep that inset on top too.
      after.Top = before.Top + (WindowState == FormWindowState.Maximized ? after.Left - before.Left : 0);
      Marshal.StructureToPtr(after, m.LParam, false);
      m.Result = IntPtr.Zero;
      return;
    }
    base.WndProc(ref m);
  }

  protected override void OnSizeChanged(EventArgs e) {
    base.OnSizeChanged(e);
    if (ready) Post("{\"type\":\"window\",\"maximized\":" + (WindowState == FormWindowState.Maximized ? "true" : "false") + "}");
  }

  protected override async void OnLoad(EventArgs e) {
    base.OnLoad(e);
    try {
      CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, profileDir, null);
      await view.EnsureCoreWebView2Async(environment);
      CoreWebView2 core = view.CoreWebView2;
      bool debug = Environment.GetEnvironmentVariable("CLAUDE_NIANG_DEVTOOLS") == "1";
      core.Settings.AreDevToolsEnabled = debug;
      core.Settings.AreDefaultContextMenusEnabled = debug;
      core.Settings.IsStatusBarEnabled = false;
      core.Settings.AreBrowserAcceleratorKeysEnabled = debug;
      // Lets the page mark its header as the window's title bar (app-region: drag).
      core.Settings.IsNonClientRegionSupportEnabled = true;
      core.SetVirtualHostNameToFolderMapping(Host, appDir, CoreWebView2HostResourceAccessKind.DenyCors);
      core.NavigationStarting += (s, a) => {
        if (a.Uri.StartsWith("https://" + Host + "/", StringComparison.OrdinalIgnoreCase)) return;
        a.Cancel = true; OpenExternal(a.Uri);
      };
      core.NewWindowRequested += (s, a) => { a.Handled = true; OpenExternal(a.Uri); };
      core.WebMessageReceived += (s, a) => { string m = null; try { m = a.TryGetWebMessageAsString(); } catch (Exception) { } if (m != null) OnMessage(m); };
      core.Navigate("https://" + Host + "/runtime/dashboard/index.html?view=" + Uri.EscapeDataString(startView) + (snapshotPath.Length > 0 ? "&snapshot=1" : ""));
      StartScan();
      tick.Start();
      if (snapshotPath.Length > 0) {
        // A preview that never finishes rendering fails instead of hanging.
        Timer limit = new Timer(); limit.Interval = 30000;
        limit.Tick += delegate { limit.Stop(); if (Failure == null) Failure = "snapshot timed out"; Close(); };
        limit.Start();
      }
    } catch (Exception ex) {
      Failure = ex.Message;
      Controls.Clear();
      Label label = new Label();
      label.Dock = DockStyle.Fill; label.TextAlign = ContentAlignment.MiddleCenter;
      label.Font = new Font("Microsoft YaHei UI", 11f); label.ForeColor = Color.FromArgb(122, 90, 73);
      label.Text = "用量管理窗口没能启动：" + ex.Message + "\r\n请确认已安装 Microsoft Edge WebView2 运行时。";
      Controls.Add(label);
      if (snapshotPath.Length > 0) Close();
    }
  }

  protected override void OnShown(EventArgs e) {
    base.OnShown(e);
    if (snapshotPath.Length == 0) { try { TopMost = true; Activate(); TopMost = false; } catch (Exception) { } }
  }

  protected override void OnFormClosed(FormClosedEventArgs e) {
    tick.Stop();
    try { if (scan != null && !scan.HasExited) scan.Kill(); } catch (Exception) { }
    if (bigIcon != IntPtr.Zero) DestroyIcon(bigIcon);
    if (smallIcon != IntPtr.Zero) DestroyIcon(smallIcon);
    base.OnFormClosed(e);
  }

  // --- page messages -------------------------------------------------------------
  void OnMessage(string message) {
    if (message == "ready") { ready = true; stateStamp = ""; usageStamp = ""; Pump(); OnSizeChanged(EventArgs.Empty); return; }
    if (message == "win-min") { WindowState = FormWindowState.Minimized; return; }
    if (message == "win-max") { WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; return; }
    if (message == "win-close") { Close(); return; }
    if (message == "refresh") { RequestQuotaRead(); StartScan(); return; }
    if (message == "rescan") { StartScan(); return; }
    if (message == "focus-claude") { Toast(FocusClaude() ? "已切换到 Claude 窗口" : "没有找到打开的 Claude 窗口"); return; }
    if (message == "open-usage-page") { OpenExternal("https://claude.ai/settings/usage"); return; }
    if (message == "login") { StartLogin(); return; }
    if (message == "rendered") { if (snapshotPath.Length > 0) Capture(); return; }
    if (message.StartsWith("error\n", StringComparison.Ordinal)) { if (snapshotPath.Length > 0 && Failure == null) Failure = "page error: " + message.Substring(6); return; }
    if (message.StartsWith("export\n", StringComparison.Ordinal)) { Export(message); return; }
  }

  void Post(string json) { try { if (view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json); } catch (Exception) { } }
  void Toast(string text) { Post("{\"type\":\"toast\",\"text\":" + Quote(text) + "}"); }
  static string Quote(string s) {
    StringBuilder b = new StringBuilder("\"");
    foreach (char c in s ?? "") {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }

  static void OpenExternal(string uri) {
    Uri parsed;
    if (!Uri.TryCreate(uri, UriKind.Absolute, out parsed) || parsed.Scheme != "https") return;
    string host = parsed.Host.ToLowerInvariant();
    if (host != "claude.ai" && !host.EndsWith(".claude.ai") && host != "github.com") return;
    try { Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true }); } catch (Exception) { }
  }

  // Same request the widget writes when it is clicked: the worker reads the
  // selected organization once (and applies its own debounce and rate limits).
  void RequestQuotaRead() {
    try {
      string json = "{\"id\":\"" + Guid.NewGuid().ToString("N") + "\",\"at\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ",\"reason\":\"user\"}";
      string file = Path.Combine(dataDir, "refresh.flag"), temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
      File.WriteAllText(temp, json, new UTF8Encoding(false));
      if (File.Exists(file)) File.Replace(temp, file, null); else File.Move(temp, file);
      Toast("已请求读取额度");
    } catch (Exception ex) { Toast("没能请求读取额度：" + ex.Message); }
  }

  static Process FindClaude() {
    foreach (Process p in Process.GetProcessesByName("Claude")) {
      try { if (p.MainWindowHandle != IntPtr.Zero) return p; } catch (Exception) { }
    }
    return null;
  }
  static bool FocusClaude() {
    Process p = FindClaude();
    if (p == null) return false;
    IntPtr hwnd = p.MainWindowHandle;
    if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
    return SetForegroundWindow(hwnd);
  }

  void StartLogin() {
    try {
      string login = Path.Combine(appDir, "Login.ps1");
      ProcessStartInfo info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
        "-NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + login + "\"");
      info.UseShellExecute = false; info.CreateNoWindow = true;
      Process.Start(info);
      Toast("已打开登录窗口");
    } catch (Exception ex) { Toast("登录窗口没能打开：" + ex.Message); }
  }

  void Export(string message) {
    // export\n<csv|json>\n<suggested file name>\n<content>
    string[] parts = message.Split(new[] { '\n' }, 4);
    if (parts.Length < 4) return;
    bool csv = parts[1] == "csv";
    using (SaveFileDialog dialog = new SaveFileDialog()) {
      dialog.Title = csv ? "导出会话表格" : "导出用量数据";
      dialog.Filter = csv ? "CSV 表格 (*.csv)|*.csv" : "JSON 数据 (*.json)|*.json";
      dialog.FileName = Path.GetFileName(parts[2]);
      dialog.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
      if (dialog.ShowDialog(this) != DialogResult.OK) return;
      try { File.WriteAllText(dialog.FileName, parts[3], new UTF8Encoding(false)); Toast("已导出：" + dialog.FileName); }
      catch (Exception ex) { Toast("导出失败：" + ex.Message); }
    }
  }

  // --- live data -----------------------------------------------------------------
  void StartScan() {
    try {
      if (scan != null && !scan.HasExited) return;
      if (string.IsNullOrEmpty(nodePath) || !File.Exists(nodePath)) return;
      ProcessStartInfo info = new ProcessStartInfo(nodePath, "\"" + Path.Combine(appDir, @"runtime\local-usage.mjs") + "\" \"" + configPath + "\"");
      info.UseShellExecute = false; info.CreateNoWindow = true; info.RedirectStandardOutput = true;
      scan = Process.Start(info);
      scan.OutputDataReceived += delegate { };
      scan.BeginOutputReadLine();
      lastScan = DateTime.UtcNow;
    } catch (Exception) { scan = null; }
  }
  bool Scanning { get { try { return scan != null && !scan.HasExited; } catch (Exception) { return false; } } }

  static string Stamp(string file) {
    try { FileInfo f = new FileInfo(file); return f.Exists ? f.LastWriteTimeUtc.Ticks + ":" + f.Length : "0"; } catch (Exception) { return "?"; }
  }
  // The file's JSON as is, or null when it is missing or caught mid-write.
  static string ReadJson(string file) {
    try {
      if (!File.Exists(file)) return "null";
      string text = File.ReadAllText(file, Encoding.UTF8).Trim().TrimStart('﻿');
      return text.Length > 1 && (text[0] == '{' || text[0] == '[') && (text[text.Length - 1] == '}' || text[text.Length - 1] == ']') ? text : null;
    } catch (Exception) { return null; }
  }

  void Pump() {
    if (!ready) return;
    // A preview image waits for the first usage scan, so it shows real numbers.
    if (snapshotPath.Length > 0 && Scanning) return;
    if (snapshotPath.Length == 0 && WindowState != FormWindowState.Minimized && (DateTime.UtcNow - lastScan).TotalSeconds >= 20) StartScan();
    string status = Path.Combine(dataDir, "status.json"), orgs = Path.Combine(dataDir, "org-snapshots.json"), index = Path.Combine(dataDir, "usage-index.json");
    bool claude = FindClaude() != null, scanning = Scanning;
    string stamp = Stamp(status) + "|" + Stamp(orgs) + "|" + claude + "|" + scanning;
    if (stamp != stateStamp) {
      string a = ReadJson(status), b = ReadJson(orgs);
      if (a != null && b != null) {
        stateStamp = stamp;
        Post("{\"type\":\"state\",\"status\":" + a + ",\"orgs\":" + b + ",\"claudeRunning\":" + (claude ? "true" : "false") +
          ",\"scanning\":" + (scanning ? "true" : "false") + ",\"version\":" + Quote(version) + "}");
      }
    }
    string u = Stamp(index);
    if (u != usageStamp) {
      string text = ReadJson(index);
      if (text != null) { usageStamp = u; Post("{\"type\":\"usage\",\"index\":" + text + "}"); }
    }
  }

  async void Capture() {
    if (Failure != null) { Close(); return; }
    try {
      await Task.Delay(400);
      using (FileStream stream = File.Create(snapshotPath))
        await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
    } catch (Exception ex) { Failure = ex.Message; }
    Close();
  }
}
