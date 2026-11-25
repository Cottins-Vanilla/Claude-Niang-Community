// Claude 娘 · update check (C# 5, compiled at runtime by the widget and by the
// usage window). It reads the public release list of the community repository
// from GitHub and nothing else: no account data, cookies or local files are
// sent. Requests use the system proxy, like a browser on this computer.
//   Version tags: vX.Y.Z (formal) and vX.Y.Z-beta.N (test builds, pre-releases).
//   Settings: <data>\update-settings.json {"autoCheck":true,"channel":"stable"|"beta"}
// CLAUDE_NIANG_UPDATE_FEED=<file> replaces the network with a local release list (tests).
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

[DataContract]
public sealed class ClaudeNiangReleaseInfo {
  [DataMember(Name = "tag_name")] public string Tag;
  [DataMember(Name = "name")] public string Name;
  [DataMember(Name = "html_url")] public string Url;
  [DataMember(Name = "prerelease")] public bool Prerelease;
  [DataMember(Name = "draft")] public bool Draft;
  [DataMember(Name = "published_at")] public string PublishedAt;
}

[DataContract]
public sealed class ClaudeNiangUpdateSettings {
  [DataMember(Name = "autoCheck", EmitDefaultValue = false)] public bool? AutoCheckValue;
  [DataMember(Name = "channel", EmitDefaultValue = false)] public string Channel;
  public bool AutoCheck { get { return AutoCheckValue != false; } }
  public bool Beta { get { return Channel == "beta"; } }
}

public static class ClaudeNiangUpdate {
  public const string Repository = "Cottins-Vanilla/Claude-Niang-Community";
  public const string ReleasesPage = "https://github.com/" + Repository + "/releases";
  const string Api = "https://api.github.com/repos/" + Repository + "/releases?per_page=30";
  const int MaxBytes = 2 * 1024 * 1024;

  // [major, minor, patch, beta] where a formal release ranks above all its betas.
  public static long[] Parse(string version) {
    Match m = Regex.Match((version ?? "").Trim(), @"^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-beta\.([1-9]\d{0,5}))?$");
    if (!m.Success) return null;
    return new long[] { long.Parse(m.Groups[1].Value), long.Parse(m.Groups[2].Value), long.Parse(m.Groups[3].Value), m.Groups[4].Success ? long.Parse(m.Groups[4].Value) : long.MaxValue };
  }
  public static int Compare(string a, string b) {
    long[] x = Parse(a), y = Parse(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : -1) : 1;
    for (int i = 0; i < 4; i++) if (x[i] != y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }
  public static bool IsBeta(string version) { long[] v = Parse(version); return v != null && v[3] != long.MaxValue; }

  // --- settings ----------------------------------------------------------------
  public static ClaudeNiangUpdateSettings LoadSettings(string dataDir) {
    try {
      string file = Path.Combine(dataDir, "update-settings.json");
      if (File.Exists(file)) {
        byte[] bytes = File.ReadAllBytes(file);
        using (MemoryStream stream = new MemoryStream(bytes)) {
          ClaudeNiangUpdateSettings s = (ClaudeNiangUpdateSettings)new DataContractJsonSerializer(typeof(ClaudeNiangUpdateSettings)).ReadObject(stream);
          if (s != null) { if (s.Channel != "beta") s.Channel = "stable"; return s; }
        }
      }
    } catch (Exception) { }
    ClaudeNiangUpdateSettings d = new ClaudeNiangUpdateSettings(); d.Channel = "stable"; return d;
  }
  public static void SaveSettings(string dataDir, bool autoCheck, bool beta) {
    Directory.CreateDirectory(dataDir);
    string file = Path.Combine(dataDir, "update-settings.json"), temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
    File.WriteAllText(temp, "{\"autoCheck\":" + (autoCheck ? "true" : "false") + ",\"channel\":\"" + (beta ? "beta" : "stable") + "\"}", new UTF8Encoding(false));
    if (File.Exists(file)) File.Replace(temp, file, null); else File.Move(temp, file);
  }
  public static string SettingsJson(ClaudeNiangUpdateSettings s) {
    return "{\"autoCheck\":" + (s.AutoCheck ? "true" : "false") + ",\"channel\":\"" + (s.Beta ? "beta" : "stable") + "\"}";
  }

  // --- the check ---------------------------------------------------------------
  public static Task<string> CheckAsync(string current, bool includeBeta, int timeoutMs) {
    return Task.Run(() => Check(current, includeBeta, timeoutMs));
  }
  public static string Check(string current, bool includeBeta, int timeoutMs) {
    string body;
    try { body = Fetch(timeoutMs); }
    catch (Exception ex) { return Failure(current, includeBeta, Explain(ex)); }
    return Evaluate(body, current, includeBeta, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
  }

  // Pure part, also used by the tests: release list JSON → result JSON.
  public static string Evaluate(string releasesJson, string current, bool includeBeta, long checkedAt) {
    ClaudeNiangReleaseInfo[] list;
    try {
      using (MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(releasesJson ?? "")))
        list = (ClaudeNiangReleaseInfo[])new DataContractJsonSerializer(typeof(ClaudeNiangReleaseInfo[])).ReadObject(stream);
    } catch (Exception) { return Failure(current, includeBeta, "GitHub 返回的版本列表看不懂，稍后再试"); }
    ClaudeNiangReleaseInfo best = null;
    foreach (ClaudeNiangReleaseInfo r in list ?? new ClaudeNiangReleaseInfo[0]) {
      if (r == null || r.Draft || Parse(r.Tag) == null) continue;
      // A formal-channel user is offered formal releases only; tags decide, not just the flag.
      bool beta = r.Prerelease || IsBeta(r.Tag);
      if (beta && !includeBeta) continue;
      if (best == null || Compare(r.Tag, best.Tag) > 0) best = r;
    }
    if (best == null) return Failure(current, includeBeta, includeBeta ? "还没有发布过版本" : "还没有发布过正式版");
    string latest = best.Tag.Trim().TrimStart('v');
    bool newer = Parse(current) != null && Compare(latest, current) > 0;
    string url = best.Url ?? "";
    if (!url.StartsWith(ReleasesPage + "/tag/", StringComparison.Ordinal)) url = ReleasesPage + "/tag/" + Uri.EscapeDataString(best.Tag.Trim());
    return "{\"ok\":true,\"current\":" + Quote(current) + ",\"latest\":" + Quote(latest) + ",\"tag\":" + Quote(best.Tag.Trim()) +
      ",\"name\":" + Quote(best.Name ?? "") + ",\"url\":" + Quote(url) + ",\"prerelease\":" + (best.Prerelease || IsBeta(best.Tag) ? "true" : "false") +
      ",\"newer\":" + (newer ? "true" : "false") + ",\"channel\":\"" + (includeBeta ? "beta" : "stable") + "\",\"checkedAt\":" + checkedAt + "}";
  }

  static string Fetch(int timeoutMs) {
    string feed = Environment.GetEnvironmentVariable("CLAUDE_NIANG_UPDATE_FEED");
    if (!string.IsNullOrEmpty(feed)) return File.ReadAllText(feed, Encoding.UTF8);
    ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(Api);
    request.Method = "GET";
    request.UserAgent = "Claude-Niang-update-check";
    request.Accept = "application/vnd.github+json";
    request.Timeout = timeoutMs; request.ReadWriteTimeout = timeoutMs;
    request.AllowAutoRedirect = true;
    IWebProxy proxy = WebRequest.GetSystemWebProxy();
    if (proxy != null) { proxy.Credentials = CredentialCache.DefaultCredentials; request.Proxy = proxy; }
    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
    using (Stream stream = response.GetResponseStream())
    using (MemoryStream buffer = new MemoryStream()) {
      byte[] chunk = new byte[16384]; int read;
      while ((read = stream.Read(chunk, 0, chunk.Length)) > 0) {
        buffer.Write(chunk, 0, read);
        if (buffer.Length > MaxBytes) throw new InvalidDataException("response too large");
      }
      return Encoding.UTF8.GetString(buffer.ToArray());
    }
  }

  static string Explain(Exception ex) {
    WebException web = ex as WebException;
    if (web != null) {
      HttpWebResponse response = web.Response as HttpWebResponse;
      if (response != null) {
        int code = (int)response.StatusCode;
        if (code == 403 || code == 429) return "GitHub 暂时限制了查询次数，过一会儿再试";
        if (code == 404) return "没有找到社区版的发布页";
        return "GitHub 返回了错误（HTTP " + code + "）";
      }
      if (web.Status == WebExceptionStatus.Timeout) return "连接 GitHub 超时，请检查网络或代理";
      return "连不上 GitHub，请检查网络或代理";
    }
    return "检查更新没有完成：" + ex.Message;
  }
  static string Failure(string current, bool includeBeta, string error) {
    return "{\"ok\":false,\"current\":" + Quote(current) + ",\"channel\":\"" + (includeBeta ? "beta" : "stable") + "\",\"error\":" + Quote(error) +
      ",\"checkedAt\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "}";
  }
  public static string Quote(string s) {
    StringBuilder b = new StringBuilder("\"");
    foreach (char c in s ?? "") {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }
}
