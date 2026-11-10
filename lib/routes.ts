// Addresses of the two detail pages. They take the id as a query parameter
// (not a path segment) so every page of the app is a static file: opening a
// task never waits on a server. Old /deliverables/<id> and /clients/<id>
// links are redirected in netlify.toml.

export const taskHref = (id: string) => `/task?id=${encodeURIComponent(id)}`;
export const clientHref = (id: string) => `/client?id=${encodeURIComponent(id)}`;
