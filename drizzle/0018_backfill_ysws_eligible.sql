-- Everyone who signed up before this migration passed the old sign-in gate,
-- which required the ysws_eligible claim outright. Seed the new cached flag
-- to true for them so fulfillment pages don't flag long-standing users; the
-- cache refreshes from Hack Club Auth at their next sign-in or submission.
UPDATE "user" SET "ysws_eligible" = true;
