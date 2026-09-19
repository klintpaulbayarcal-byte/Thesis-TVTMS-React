# TVTMS React Migration Notes

The current v4 application uses a React 18 and Vite frontend with same-origin
requests to the PHP API under `/api`. React Router provides client-side routes,
while the root Apache `.htaccess` excludes `/api`, `/uploads`, real files, and
real directories before falling back to `index.html`.

The PHP API remains the authentication and authorization boundary. It holds the
server-only Supabase credential, validates the TVTMS bearer token, reloads the
current staff account, and enforces Administrator, Apprehending Officer, and
ticket-ownership rules in handlers. Browser route guards are not treated as
authorization controls.

Production deployment uses a fresh Vite `dist/` build combined with the full
PHP API and safe public assets. Node.js, Vite, tests, source-only documentation,
and private `config.local.php` values are not required on Hostinger. See
`HOSTINGER_REACT_SUPABASE_DEPLOYMENT.md` and `DEPLOYMENT_README.txt` for the
current deployment procedure and safety requirements.

