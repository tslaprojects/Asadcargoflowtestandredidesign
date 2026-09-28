-- Аудит (DB-001): ссылочная целостность для полей, которые раньше хранили id без внешнего ключа.
-- Сначала обнуляются «висячие» ссылки в необязательных полях, чтобы ограничения можно было добавить к существующим данным.
-- Для обязательных полей (автор, создатель) висячая ссылка остановит миграцию — такие записи нужно исправить вручную.

UPDATE "VerificationRequest" SET "reviewerUserId" = NULL WHERE "reviewerUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "VerificationRequest"."reviewerUserId");
UPDATE "LoadQuestion" SET "answeredByUserId" = NULL WHERE "answeredByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "LoadQuestion"."answeredByUserId");
UPDATE "Bid" SET "decidedByUserId" = NULL WHERE "decidedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "Bid"."decidedByUserId");
UPDATE "TransportOrderStatusHistory" SET "actorUserId" = NULL WHERE "actorUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "TransportOrderStatusHistory"."actorUserId");
UPDATE "TransportOrderParticipant" SET "userId" = NULL WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "TransportOrderParticipant"."userId");
UPDATE "OrderDocument" SET "deletedByUserId" = NULL WHERE "deletedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "OrderDocument"."deletedByUserId");
UPDATE "OrderDocument" SET "uploadedCompanyId" = NULL WHERE "uploadedCompanyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Company" r WHERE r."id" = "OrderDocument"."uploadedCompanyId");
UPDATE "TrackingEvent" SET "userId" = NULL WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "TrackingEvent"."userId");
UPDATE "ChatMessage" SET "senderCompanyId" = NULL WHERE "senderCompanyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Company" r WHERE r."id" = "ChatMessage"."senderCompanyId");
UPDATE "PaymentRecord" SET "createdByUserId" = NULL WHERE "createdByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "PaymentRecord"."createdByUserId");
UPDATE "PaymentTransaction" SET "requestedByUserId" = NULL WHERE "requestedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "PaymentTransaction"."requestedByUserId");
UPDATE "PaymentStatusHistory" SET "actorUserId" = NULL WHERE "actorUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "PaymentStatusHistory"."actorUserId");
UPDATE "PaymentStatusHistory" SET "transactionId" = NULL WHERE "transactionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PaymentTransaction" r WHERE r."id" = "PaymentStatusHistory"."transactionId");
UPDATE "Dispute" SET "openedByCompanyId" = NULL WHERE "openedByCompanyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Company" r WHERE r."id" = "Dispute"."openedByCompanyId");
UPDATE "Dispute" SET "resolvedByUserId" = NULL WHERE "resolvedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "Dispute"."resolvedByUserId");
UPDATE "CompanyInvite" SET "acceptedByUserId" = NULL WHERE "acceptedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "CompanyInvite"."acceptedByUserId");
UPDATE "CompanyInvite" SET "driverProfileId" = NULL WHERE "driverProfileId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DriverProfile" r WHERE r."id" = "CompanyInvite"."driverProfileId");
UPDATE "FuelAccountEntry" SET "createdByUserId" = NULL WHERE "createdByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "FuelAccountEntry"."createdByUserId");
UPDATE "FuelAccountEntry" SET "fuelTransactionId" = NULL WHERE "fuelTransactionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FuelTransaction" r WHERE r."id" = "FuelAccountEntry"."fuelTransactionId");
UPDATE "FuelAnomaly" SET "driverId" = NULL WHERE "driverId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DriverProfile" r WHERE r."id" = "FuelAnomaly"."driverId");
UPDATE "FuelAnomaly" SET "orderId" = NULL WHERE "orderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TransportOrder" r WHERE r."id" = "FuelAnomaly"."orderId");
UPDATE "FuelAnomaly" SET "reviewedByUserId" = NULL WHERE "reviewedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "FuelAnomaly"."reviewedByUserId");
UPDATE "FuelInvestigation" SET "driverId" = NULL WHERE "driverId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DriverProfile" r WHERE r."id" = "FuelInvestigation"."driverId");
UPDATE "FuelInvestigation" SET "closedByUserId" = NULL WHERE "closedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" r WHERE r."id" = "FuelInvestigation"."closedByUserId");

-- DropIndex
DROP INDEX "Vehicle_country_plateNumber_key";

-- CreateIndex
CREATE INDEX "Vehicle_country_plateNumber_idx" ON "Vehicle"("country", "plateNumber");

-- AddForeignKey
ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadDocument" ADD CONSTRAINT "LoadDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadQuestion" ADD CONSTRAINT "LoadQuestion_askedByUserId_fkey" FOREIGN KEY ("askedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadQuestion" ADD CONSTRAINT "LoadQuestion_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderStatusHistory" ADD CONSTRAINT "TransportOrderStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderParticipant" ADD CONSTRAINT "TransportOrderParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_uploadedCompanyId_fkey" FOREIGN KEY ("uploadedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderCompanyId_fkey" FOREIGN KEY ("senderCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMovement" ADD CONSTRAINT "PlannedMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedByCompanyId_fkey" FOREIGN KEY ("openedByCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeComment" ADD CONSTRAINT "DisputeComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAccountEntry" ADD CONSTRAINT "FuelAccountEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAccountEntry" ADD CONSTRAINT "FuelAccountEntry_fuelTransactionId_fkey" FOREIGN KEY ("fuelTransactionId") REFERENCES "FuelTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigation" ADD CONSTRAINT "FuelInvestigation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigation" ADD CONSTRAINT "FuelInvestigation_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigation" ADD CONSTRAINT "FuelInvestigation_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationComment" ADD CONSTRAINT "FuelInvestigationComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelInvestigationAttachment" ADD CONSTRAINT "FuelInvestigationAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Аудит (BIZ-016): госномер уникален только среди неудалённых машин — номер удалённой машины можно зарегистрировать снова
CREATE UNIQUE INDEX "Vehicle_active_plate_unique" ON "Vehicle" ("country", "plateNumber") WHERE "deletedAt" IS NULL;
