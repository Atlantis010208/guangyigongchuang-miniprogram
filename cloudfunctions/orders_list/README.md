# orders_list

Authenticated user order list function for Web and Mini Program compatible identities.

The function never trusts frontend supplied user identifiers. It resolves the caller from CloudBase context, queries only matching order records, and returns an allowlisted order list plus course asset summary.
