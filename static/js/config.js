/**
 * API + Vercel 브라우저 분석 설정
 */
(function () {
  const host = location.hostname;
  const params = new URLSearchParams(location.search);

  window.USE_BROWSER_ANALYZER =
    params.get("browser") === "1" ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".github.io");

  if (params.get("api")) {
    window.API_BASE = params.get("api").replace(/\/$/, "");
    return;
  }

  const sameOrigin =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".onrender.com");

  window.API_BASE = window.USE_BROWSER_ANALYZER
    ? ""
    : sameOrigin
      ? ""
      : "https://tennis-swing-api.onrender.com";
})();
