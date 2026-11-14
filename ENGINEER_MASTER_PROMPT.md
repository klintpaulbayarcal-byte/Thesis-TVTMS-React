# TVTMS Public User Account Implementation Prompt

You are a senior full-stack engineer working in the TVTMS React/Vite and PHP API repository.

## Objective

Implement the panel revision that requires every public user/driver to have an individual account. A public user must be able to register, sign in, and maintain:

- Personal/driver details
- Driver's license information
- Vehicle registration information

## Repository constraints

- Preserve the existing React 18, React Router, Vite, PHP API, and Supabase architecture.
- Reuse the existing `AuthContext`, `API` service, `ProtectedRoute`, `AppLayout`, `Profile`, and design system.
- Keep admin and apprehending-officer capabilities unchanged.
- Never expose passwords, password hashes, or authentication secrets to the browser.
- Do not allow a public user to access staff routes by changing client-side state or URL.
- Validate all registration and profile data on the server as well as in the browser.
- Use the repository's existing error response format and password-strength rules.

## Required behavior

1. Add public registration with a dedicated `/register` page.
2. Create public accounts with role `driver`; never accept a client-supplied role.
3. Permit active driver accounts to sign in and receive the same session token format as staff.
4. Permit driver sessions to read/update only their own profile and change their own password.
5. Add fields for contact number, driver's license number and expiry, plate number, vehicle registration number and expiry, vehicle type, and vehicle make.
6. Make the profile page show relevant driver and registration fields only for driver accounts.
7. Route authenticated drivers to `/profile`; keep staff routing unchanged.
8. Keep staff-only APIs and pages protected by server-side role checks.
9. Add the database migration and update the canonical schema.
10. Verify the JSX/build and relevant contract tests.

## Definition of done

- A new public user can register, sign in, view `/profile`, update driver/license/registration details, and change their password.
- Invalid, duplicate, weak-password, and malformed inputs receive explicit errors.
- Admins and officers retain their existing login and profile behavior.
- Drivers cannot open admin/officer pages or invoke staff-only API operations.
- No unrelated behavior or files are changed.
