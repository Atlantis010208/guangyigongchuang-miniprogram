# Implementation Plan

- [x] 1. Confirm current data flow
  - Inspect V2「我的」page service calls.
  - Inspect existing `designer_profile` and `designer_portfolios` cloud functions.
  - Inspect backend admin designer and whitelist APIs.
  - _Requirement: 1, 4_

- [x] 2. Rework `designer_profile` backend integration
  - Require active `designer_whitelist` before returning profile data.
  - Read real `designers` record using whitelist `designerId` first.
  - Normalize profile fields for the V2 page.
  - Keep update action compatible with existing profile editing.
  - _Requirement: 1, 2, 4_

- [x] 3. Rework `designer_portfolios` backend integration
  - Require active `designer_whitelist`.
  - Return real `designer_portfolios` records.
  - Add compatibility fallback for admin-maintained `designers.portfolioImages`.
  - Preserve empty result when no backend portfolio data exists.
  - _Requirement: 2, 3, 4_

- [x] 4. Remove V2 profile page mock data
  - Remove local static `WORKS` constant.
  - Render works only from cloud response.
  - Add true empty state for no works.
  - _Requirement: 3_

- [x] 5. Add automated contract coverage
  - Add backend cloud function contract tests.
  - Update preview tests to assert mock removal and empty works state.
  - _Requirement: 1, 2, 3, 4_

- [x] 6. Verify and deploy
  - Run syntax checks and project specs.
  - Deploy `designer_profile` and `designer_portfolios` cloud functions.
  - Re-test with backend active whitelist and disabled whitelist records.
  - _Requirement: 1, 2, 3, 4_

- [x] 7. Extend the shared-account specification
  - Define `users` as the single owner/designer login account.
  - Define trusted identity lookup and certification binding fields.
  - Define admin reactivation and revocation behavior.
  - _Requirement: 5, 6_

- [x] 8. Implement shared login and designer certification binding
  - Reuse users by server-side OPENID, UNIONID, and alternateOpenids.
  - Remove client user-id fallback from phone authorization.
  - Bind users, designer whitelist, and designer profile idempotently.
  - Return shared account data for the designer login state.
  - _Requirement: 5, 6_

- [x] 9. Complete admin whitelist integration
  - Return linked/unlinked state and activation metadata.
  - Reactivate disabled duplicate imports.
  - Revoke linked designer access when whitelist records are removed.
  - _Requirement: 4, 6_

- [x] 10. Verify, deploy, and run live integration checks
  - Add regression tests for shared identity and certification lifecycle.
  - Run syntax, backend contract, admin build, and V2 verification checks.
  - Deploy all changed cloud functions and inspect live function status/logs.
  - _Requirement: 4, 5, 6_
