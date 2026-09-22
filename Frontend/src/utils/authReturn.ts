// Only product/earning destinations are retained; never accept an external redirect.
export function authReturn() {
    const next = new URLSearchParams(window.location.search).get('next') || sessionStorage.getItem('gleenc-auth-return') || '/';
    return /^\/(products\/[^/?#]+|opportunities|create-video)([?#].*)?$/.test(next) ? next : '/';
}
export function rememberAuthReturn() {
    const next = window.location.pathname + window.location.search;
    if (/^\/(products\/[^/?#]+|opportunities|create-video)([?#].*)?$/.test(next))
        sessionStorage.setItem('gleenc-auth-return', next);
}
