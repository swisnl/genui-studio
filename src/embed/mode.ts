const params = new URLSearchParams(window.location.search)

/** True when the studio runs inside a host page, e.g. `index.html?embed=1`. */
export const isEmbedded = params.get('embed') === '1'

/** The only origin the embedded studio talks to. Defaults to its own origin. */
export const parentOrigin = params.get('parentOrigin') ?? window.location.origin
