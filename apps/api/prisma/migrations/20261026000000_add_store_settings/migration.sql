CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreSettings_singleton_check" CHECK ("id" = 'main')
);

INSERT INTO "StoreSettings" ("id", "acceptingOrders")
VALUES ('main', false);
