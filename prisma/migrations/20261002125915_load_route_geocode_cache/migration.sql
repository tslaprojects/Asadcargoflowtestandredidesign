-- CreateEnum
CREATE TYPE "RouteSource" AS ENUM ('PROVIDER', 'ESTIMATE');

-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "routeComputedAt" TIMESTAMPTZ(3),
ADD COLUMN     "routeDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "routeDurationMin" INTEGER,
ADD COLUMN     "routeGeometry" JSONB,
ADD COLUMN     "routeProvider" TEXT,
ADD COLUMN     "routeSource" "RouteSource",
ADD COLUMN     "routeStopsHash" TEXT;

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" TEXT,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_country_query_key" ON "GeocodeCache"("country", "query");
