-- CreateEnum
CREATE TYPE "PaymentTransactionKind" AS ENUM ('AUTHORIZE', 'RESERVE', 'RELEASE', 'REFUND', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementIntent" AS ENUM ('RETURN', 'CITY', 'DIRECTION', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DisputeReason" ADD VALUE 'NOT_DELIVERED';
ALTER TYPE "DisputeReason" ADD VALUE 'SHORTAGE';
ALTER TYPE "DisputeReason" ADD VALUE 'TERMS_VIOLATION';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'NEXT_LOAD_SUGGESTIONS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_AUTHORIZED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_RESERVED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_RELEASE_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_RELEASED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_PARTIALLY_RELEASED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_DISPUTED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_CANCELLED';

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'SECURE_DEAL';

-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN     "authorizedAt" TIMESTAMPTZ(3),
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN     "disputeId" UUID,
ADD COLUMN     "failedAt" TIMESTAMPTZ(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "feeCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "feeFixed" DECIMAL(14,2),
ADD COLUMN     "feePercent" DECIMAL(5,2),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "platformFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerTransactionId" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMPTZ(3),
ADD COLUMN     "releaseRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "releasedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "releasedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reservedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "TransportOrder" ADD COLUMN     "confirmationDueAt" TIMESTAMPTZ(3),
ADD COLUMN     "receiptAutoConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiptConfirmedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "PaymentTransactionKind" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestedByUserId" UUID,
    "reason" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatusHistory" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus" "PaymentStatus" NOT NULL,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL,
    "reason" TEXT,
    "transactionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "vehicleId" UUID,
    "driverId" UUID,
    "sourceOrderId" UUID,
    "createdByUserId" UUID NOT NULL,
    "intent" "MovementIntent" NOT NULL,
    "originLabel" TEXT NOT NULL,
    "originCountry" TEXT,
    "originCity" TEXT,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "originSource" TEXT NOT NULL,
    "allowedDeviationKm" INTEGER NOT NULL DEFAULT 250,
    "maxPickupDistanceKm" INTEGER NOT NULL DEFAULT 300,
    "availableFrom" TIMESTAMPTZ(3) NOT NULL,
    "availableUntil" TIMESTAMPTZ(3) NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlannedMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMovementDestination" (
    "id" UUID NOT NULL,
    "movementId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlannedMovementDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentId_createdAt_idx" ON "PaymentTransaction"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerTransactionId_idx" ON "PaymentTransaction"("provider", "providerTransactionId");

-- CreateIndex
CREATE INDEX "PaymentStatusHistory_paymentId_createdAt_idx" ON "PaymentStatusHistory"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PlannedMovement_companyId_status_idx" ON "PlannedMovement"("companyId", "status");

-- CreateIndex
CREATE INDEX "PlannedMovement_vehicleId_status_idx" ON "PlannedMovement"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "PlannedMovement_sourceOrderId_idx" ON "PlannedMovement"("sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedMovementDestination_movementId_sequence_key" ON "PlannedMovementDestination"("movementId", "sequence");

-- CreateIndex
CREATE INDEX "PaymentRecord_type_status_idx" ON "PaymentRecord"("type", "status");

-- CreateIndex
CREATE INDEX "TransportOrder_currentStatus_confirmationDueAt_idx" ON "TransportOrder"("currentStatus", "confirmationDueAt");

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovement" ADD CONSTRAINT "PlannedMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovement" ADD CONSTRAINT "PlannedMovement_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovement" ADD CONSTRAINT "PlannedMovement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovement" ADD CONSTRAINT "PlannedMovement_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "TransportOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovementDestination" ADD CONSTRAINT "PlannedMovementDestination_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "PlannedMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
