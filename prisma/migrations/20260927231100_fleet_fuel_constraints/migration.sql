-- Ограничения целостности модуля Fleet Fuel Control

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_tank_positive" CHECK ("tankCapacityLiters" IS NULL OR "tankCapacityLiters" > 0),
  ADD CONSTRAINT "Vehicle_fuel_norm_positive" CHECK ("fuelNormPer100Km" IS NULL OR "fuelNormPer100Km" > 0);

ALTER TABLE "FuelAccount"
  ADD CONSTRAINT "FuelAccount_balance_non_negative" CHECK ("balance" >= 0),
  ADD CONSTRAINT "FuelAccount_reserved_range" CHECK ("reserved" >= 0 AND "reserved" <= "balance");

ALTER TABLE "FuelAccountEntry"
  ADD CONSTRAINT "FuelAccountEntry_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "FuelCard"
  ADD CONSTRAINT "FuelCard_last4_format" CHECK ("last4" IS NULL OR "last4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "FuelCard_limits_positive" CHECK (
    ("perTransactionLiters" IS NULL OR "perTransactionLiters" > 0) AND
    ("dailyLiters" IS NULL OR "dailyLiters" > 0) AND
    ("monthlyLiters" IS NULL OR "monthlyLiters" > 0) AND
    ("dailyAmount" IS NULL OR "dailyAmount" > 0) AND
    ("monthlyAmount" IS NULL OR "monthlyAmount" > 0)
  ),
  ADD CONSTRAINT "FuelCard_time_window" CHECK (
    ("allowedFromMinute" IS NULL AND "allowedToMinute" IS NULL) OR
    ("allowedFromMinute" BETWEEN 0 AND 1439 AND "allowedToMinute" BETWEEN 0 AND 1439)
  );

ALTER TABLE "FuelTransaction"
  ADD CONSTRAINT "FuelTransaction_liters_positive" CHECK ("liters" > 0),
  ADD CONSTRAINT "FuelTransaction_amounts_non_negative" CHECK ("pricePerLiter" >= 0 AND "totalAmount" >= 0 AND "authorizedAmount" >= 0),
  ADD CONSTRAINT "FuelTransaction_score_range" CHECK ("anomalyScore" BETWEEN 0 AND 100);

ALTER TABLE "TelemetryReading"
  ADD CONSTRAINT "TelemetryReading_fuel_source_required" CHECK ("fuelLevelLiters" IS NULL OR "fuelLevelSource" IS NOT NULL),
  ADD CONSTRAINT "TelemetryReading_values_range" CHECK (
    ("fuelLevelLiters" IS NULL OR "fuelLevelLiters" >= 0) AND
    ("odometerKm" IS NULL OR "odometerKm" >= 0) AND
    ("speedKmh" IS NULL OR "speedKmh" >= 0) AND
    ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90) AND
    ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  );

ALTER TABLE "FuelAnomaly"
  ADD CONSTRAINT "FuelAnomaly_score_range" CHECK ("score" BETWEEN 0 AND 100);

-- Устройство телематики привязано не более чем к одному автомобилю (сопоставление входящих показаний)
CREATE UNIQUE INDEX "Vehicle_telematics_device_unique"
  ON "Vehicle" ("telematicsProvider", "telematicsDeviceId")
  WHERE "telematicsDeviceId" IS NOT NULL;
