-- AlterTable
ALTER TABLE "IngredientPrice" ADD COLUMN     "userPackagePrice" DOUBLE PRECISION,
ADD COLUMN     "userPackageSize" DOUBLE PRECISION,
ADD COLUMN     "userPackageUnit" TEXT,
ALTER COLUMN "pricePerUnit" SET DEFAULT 0,
ALTER COLUMN "unit" SET DEFAULT 'יחידה';
