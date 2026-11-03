ALTER TABLE "PayMongoCheckoutAttempt" ADD COLUMN "startedAt" TIMESTAMP(3);
-- Existing snapshots have uncertain transport history. Never permit a new POST.
UPDATE "PayMongoCheckoutAttempt" SET "startedAt" = "createdAt";
