-- CreateEnum
CREATE TYPE "DataMode" AS ENUM ('REAL', 'DEMO');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "dataMode" "DataMode" NOT NULL DEFAULT 'REAL';
