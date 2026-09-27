-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'PETROL', 'LNG', 'CNG', 'LPG', 'ADBLUE', 'OTHER');

-- CreateEnum
CREATE TYPE "FuelCardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'SUSPENDED', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FuelTransactionStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'APPROVED', 'COMPLETED', 'DECLINED', 'REVERSED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "FuelTransactionSource" AS ENUM ('PROVIDER', 'MANUAL', 'DRIVER_APP', 'DEMO');

-- CreateEnum
CREATE TYPE "FuelMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "FuelLevelSource" AS ENUM ('CAN_J1939', 'FUEL_SENSOR');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('TELEMATICS', 'FUEL_SENSOR', 'GPS_TRACKER', 'DRIVER_APP', 'MANUAL', 'DEMO');

-- CreateEnum
CREATE TYPE "FuelAccountEntryType" AS ENUM ('TOP_UP', 'RESERVE', 'RELEASE', 'CHARGE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FuelAnomalyType" AS ENUM ('LOCATION_MISMATCH', 'FUEL_LEVEL_MISMATCH', 'TANK_CAPACITY_EXCEEDED', 'UNEXPECTED_FUEL_DROP', 'FREQUENT_REFUELING', 'ROUTE_DEVIATION');

-- CreateEnum
CREATE TYPE "FuelAnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FuelAnomalyStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'INVESTIGATING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FuelInvestigationStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FUEL_ANOMALY';
ALTER TYPE "NotificationType" ADD VALUE 'FUEL_CARD_UPDATED';

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "engineType" TEXT,
ADD COLUMN     "fuelNormPer100Km" DECIMAL(5,1),
ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "tankCapacityLiters" DECIMAL(8,1),
ADD COLUMN     "telematicsDeviceId" TEXT,
ADD COLUMN     "telematicsProvider" TEXT;

-- CreateTable
CREATE TABLE "FuelAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAccountEntry" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "FuelAccountEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "reservedAfter" DECIMAL(14,2) NOT NULL,
    "fuelTransactionId" UUID,
    "externalReference" TEXT,
    "note" TEXT,
    "createdByUserId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelAccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCard" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fuelAccountId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCardId" TEXT NOT NULL,
    "last4" TEXT,
    "status" "FuelCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3),
    "perTransactionLiters" DECIMAL(8,1),
    "dailyLiters" DECIMAL(8,1),
    "monthlyLiters" DECIMAL(10,1),
    "dailyAmount" DECIMAL(14,2),
    "monthlyAmount" DECIMAL(14,2),
    "allowedFuelTypes" "FuelType"[] DEFAULT ARRAY[]::"FuelType"[],
    "allowedStationBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedStationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedFromMinute" INTEGER,
    "allowedToMinute" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "driverCanSeeFuelLevel" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelTransaction" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fuelAccountId" UUID NOT NULL,
    "fuelCardId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "orderId" UUID,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "stationId" TEXT,
    "stationName" TEXT NOT NULL,
    "stationBrand" TEXT,
    "stationAddress" TEXT,
    "stationCountry" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "fuelType" "FuelType" NOT NULL,
    "liters" DECIMAL(8,2) NOT NULL,
    "pricePerLiter" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "authorizedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL,
    "transactionDate" TIMESTAMPTZ(3) NOT NULL,
    "status" "FuelTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "FuelTransactionSource" NOT NULL,
    "declineReason" TEXT,
    "matchStatus" "FuelMatchStatus" NOT NULL DEFAULT 'PENDING',
    "anomalyScore" INTEGER NOT NULL DEFAULT 0,
    "levelBefore" DOUBLE PRECISION,
    "levelAfter" DOUBLE PRECISION,
    "levelSource" "FuelLevelSource",
    "gpsDistanceKm" DOUBLE PRECISION,
    "analyzedAt" TIMESTAMPTZ(3),
    "analysis" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "source" "TelemetrySource" NOT NULL,
    "provider" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "engineOn" BOOLEAN,
    "odometerKm" DOUBLE PRECISION,
    "fuelLevelLiters" DOUBLE PRECISION,
    "fuelLevelSource" "FuelLevelSource",
    "fuelUsedTotalL" DOUBLE PRECISION,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAnomaly" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "fuelTransactionId" UUID,
    "orderId" UUID,
    "investigationId" UUID,
    "type" "FuelAnomalyType" NOT NULL,
    "severity" "FuelAnomalySeverity" NOT NULL,
    "score" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" "FuelAnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewComment" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelInvestigation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "driverId" UUID,
    "title" TEXT NOT NULL,
    "status" "FuelInvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" UUID NOT NULL,
    "resolution" TEXT,
    "closedByUserId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelInvestigationTransaction" (
    "id" UUID NOT NULL,
    "investigationId" UUID NOT NULL,
    "fuelTransactionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelInvestigationTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelInvestigationComment" (
    "id" UUID NOT NULL,
    "investigationId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FuelInvestigationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelInvestigationAttachment" (
    "id" UUID NOT NULL,
    "investigationId" UUID NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "FuelInvestigationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelAccount_companyId_currency_key" ON "FuelAccount"("companyId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "FuelAccountEntry_idempotencyKey_key" ON "FuelAccountEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FuelAccountEntry_accountId_createdAt_idx" ON "FuelAccountEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "FuelCard_companyId_status_idx" ON "FuelCard"("companyId", "status");

-- CreateIndex
CREATE INDEX "FuelCard_driverId_idx" ON "FuelCard"("driverId");

-- CreateIndex
CREATE INDEX "FuelCard_vehicleId_idx" ON "FuelCard"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCard_provider_providerCardId_key" ON "FuelCard"("provider", "providerCardId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCard_companyId_label_key" ON "FuelCard"("companyId", "label");

-- CreateIndex
CREATE INDEX "FuelTransaction_companyId_transactionDate_idx" ON "FuelTransaction"("companyId", "transactionDate");

-- CreateIndex
CREATE INDEX "FuelTransaction_vehicleId_transactionDate_idx" ON "FuelTransaction"("vehicleId", "transactionDate");

-- CreateIndex
CREATE INDEX "FuelTransaction_driverId_transactionDate_idx" ON "FuelTransaction"("driverId", "transactionDate");

-- CreateIndex
CREATE INDEX "FuelTransaction_fuelCardId_transactionDate_idx" ON "FuelTransaction"("fuelCardId", "transactionDate");

-- CreateIndex
CREATE INDEX "FuelTransaction_orderId_idx" ON "FuelTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelTransaction_provider_providerTransactionId_key" ON "FuelTransaction"("provider", "providerTransactionId");

-- CreateIndex
CREATE INDEX "TelemetryReading_vehicleId_recordedAt_idx" ON "TelemetryReading"("vehicleId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_vehicleId_source_recordedAt_key" ON "TelemetryReading"("vehicleId", "source", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelAnomaly_dedupeKey_key" ON "FuelAnomaly"("dedupeKey");

-- CreateIndex
CREATE INDEX "FuelAnomaly_companyId_status_detectedAt_idx" ON "FuelAnomaly"("companyId", "status", "detectedAt");

-- CreateIndex
CREATE INDEX "FuelAnomaly_vehicleId_detectedAt_idx" ON "FuelAnomaly"("vehicleId", "detectedAt");

-- CreateIndex
CREATE INDEX "FuelInvestigation_companyId_status_idx" ON "FuelInvestigation"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FuelInvestigationTransaction_investigationId_fuelTransactio_key" ON "FuelInvestigationTransaction"("investigationId", "fuelTransactionId");

-- CreateIndex
CREATE INDEX "FuelInvestigationComment_investigationId_createdAt_idx" ON "FuelInvestigationComment"("investigationId", "createdAt");

-- CreateIndex
CREATE INDEX "FuelInvestigationAttachment_investigationId_idx" ON "FuelInvestigationAttachment"("investigationId");

-- AddForeignKey
ALTER TABLE "FuelAccount" ADD CONSTRAINT "FuelAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAccountEntry" ADD CONSTRAINT "FuelAccountEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FuelAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_fuelAccountId_fkey" FOREIGN KEY ("fuelAccountId") REFERENCES "FuelAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_fuelAccountId_fkey" FOREIGN KEY ("fuelAccountId") REFERENCES "FuelAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_fuelCardId_fkey" FOREIGN KEY ("fuelCardId") REFERENCES "FuelCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_fuelTransactionId_fkey" FOREIGN KEY ("fuelTransactionId") REFERENCES "FuelTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "FuelInvestigation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigation" ADD CONSTRAINT "FuelInvestigation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigation" ADD CONSTRAINT "FuelInvestigation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationTransaction" ADD CONSTRAINT "FuelInvestigationTransaction_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "FuelInvestigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationTransaction" ADD CONSTRAINT "FuelInvestigationTransaction_fuelTransactionId_fkey" FOREIGN KEY ("fuelTransactionId") REFERENCES "FuelTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationComment" ADD CONSTRAINT "FuelInvestigationComment_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "FuelInvestigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationAttachment" ADD CONSTRAINT "FuelInvestigationAttachment_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "FuelInvestigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
