/**
 * API 서버 주소
 * - 로컬: 빈 문자열 (같은 서버)
 * - Vercel: Render에 배포한 API URL로 변경
 */
window.API_BASE = window.API_BASE || (
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? ""
    : "https://tennis-swing-api.onrender.com"
);
