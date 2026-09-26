-- Ограничения целостности для безопасной сделки и Next Load.
-- Вынесены в отдельную миграцию: новые значения enum нельзя использовать в той же транзакции, где они добавлены.

-- Не более одной действующей безопасной сделки на перевозку
CREATE UNIQUE INDEX "PaymentRecord_one_active_secure_deal"
  ON "PaymentRecord" ("orderId")
  WHERE "type" = 'SECURE_DEAL' AND "status" NOT IN ('PAYMENT_CANCELLED', 'PAYMENT_FAILED');

-- Суммы: положительная сумма, комиссия и движения средств не превышают сумму сделки
ALTER TABLE "PaymentRecord"
  ADD CONSTRAINT "PaymentRecord_fee_range" CHECK ("platformFee" >= 0 AND "platformFee" <= "amount"),
  ADD CONSTRAINT "PaymentRecord_movements_within_amount"
    CHECK ("releasedAmount" >= 0 AND "refundedAmount" >= 0 AND "releasedAmount" + "refundedAmount" <= "amount"),
  ADD CONSTRAINT "PaymentRecord_fee_collected_range" CHECK ("feeCollected" >= 0 AND "feeCollected" <= "platformFee"),
  -- Статусы безопасной сделки допустимы только для типа SECURE_DEAL и наоборот
  ADD CONSTRAINT "PaymentRecord_status_matches_type" CHECK (
    ("type" = 'SECURE_DEAL') = ("status"::text LIKE 'PAYMENT\_%')
  );

-- Одна незавершённая операция у провайдера на платёж: защита от двойного release/refund
CREATE UNIQUE INDEX "PaymentTransaction_one_pending_per_payment"
  ON "PaymentTransaction" ("paymentId")
  WHERE "status" = 'PENDING';

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "PaymentTransaction_fee_range" CHECK ("fee" >= 0 AND "fee" <= "amount");

-- Один активный план движения на автомобиль
CREATE UNIQUE INDEX "PlannedMovement_one_active_per_vehicle"
  ON "PlannedMovement" ("vehicleId")
  WHERE "status" = 'ACTIVE' AND "vehicleId" IS NOT NULL;

ALTER TABLE "PlannedMovement"
  ADD CONSTRAINT "PlannedMovement_window" CHECK ("availableUntil" >= "availableFrom"),
  ADD CONSTRAINT "PlannedMovement_deviation_range" CHECK ("allowedDeviationKm" BETWEEN 10 AND 1000),
  ADD CONSTRAINT "PlannedMovement_pickup_range" CHECK ("maxPickupDistanceKm" BETWEEN 10 AND 2000),
  ADD CONSTRAINT "PlannedMovement_origin_coords" CHECK ("originLat" BETWEEN -90 AND 90 AND "originLng" BETWEEN -180 AND 180);

ALTER TABLE "PlannedMovementDestination"
  ADD CONSTRAINT "PlannedMovementDestination_coords" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
