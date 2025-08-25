import type { ValidationError } from "class-validator";
import { Project } from "./model/Project";
import { DateTimeRangeClass } from "../src/model/types/DateTime";

/**
 * Converts an array of class-validator ValidationError objects into a stable, plain summary.
 *
 * @param {ValidationError[]} errors - Array of ValidationError objects from class-validator.
 * @returns {Array<{field: string, codes: string[], messages: string[]}>} An array of summary objects with field, codes, and messages.
 */
function summarizeErrors(errors: ValidationError[]) {
  return errors.map((e) => ({
    field: e.property,
    codes: e.constraints ? Object.keys(e.constraints) : [],
    messages: e.constraints ? Object.values(e.constraints) : [],
  }));
}

describe("Project Model DateTime Validation", () => {
  
  describe("Valid Project Creation", () => {
    it("should pass validation for a valid project with all required fields", async () => {
      const validProject = new Project();
      validProject.name = "Test Project";
      validProject.startDate = new Date('2024-06-15');
      validProject.endDate = new Date('2024-12-31');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      flexibleRange.from = new Date('2024-01-01');
      flexibleRange.to = new Date('2024-12-31');
      validProject.flexibleRange = flexibleRange;
      
      validProject.description = "A test project";

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation with minimum required fields only", async () => {
      const validProject = new Project();
      validProject.name = "Minimal Project";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Required Field Validation", () => {
    it("should fail validation when required fields are missing", async () => {
      const invalidProject = new Project();
      // Missing name, startDate, and activeRange

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.some(error => error.field === "name")).toBe(true);
      expect(summary.some(error => error.field === "startDate")).toBe(true);
      expect(summary.some(error => error.field === "activeRange")).toBe(true);
    });

    it("should pass validation when optional fields are missing", async () => {
      const validProject = new Project();
      validProject.name = "Optional Fields Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      // endDate, flexibleRange, and description are optional

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("DateTime Min/Max Validation", () => {
    it("should fail validation when startDate is before minimum allowed date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Date Test";
      invalidProject.startDate = new Date('2019-12-31'); // Before 2020-01-01 minimum
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should fail validation when startDate is after maximum allowed date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Date Test";
      invalidProject.startDate = new Date('2031-01-01'); // After 2030-12-31 maximum
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });

    it("should pass validation with startDate within allowed range", async () => {
      const validProject = new Project();
      validProject.name = "Date Test";
      validProject.startDate = new Date('2024-06-15'); // Within 2020-2030 range
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for endDate without min/max constraints", async () => {
      const validProject = new Project();
      validProject.name = "End Date Test";
      validProject.startDate = new Date('2024-06-15');
      validProject.endDate = new Date('1990-01-01'); // No constraints on endDate
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("DateTimeRange Validation", () => {
    it("should fail validation when activeRange is missing both from and to dates", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Range Test";
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      // Both from and to are undefined, but openStart and openEnd are false
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should fail validation when activeRange has from date after to date", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Range Test";
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-09-15'); // After 'to' date
      activeRange.to = new Date('2024-06-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const rangeError = summary.find(error => error.field === "activeRange");
      expect(rangeError).toBeDefined();
      expect(rangeError?.codes).toContain("isValidDateTimeRange");
    });

    it("should pass validation for activeRange with valid from and to dates", async () => {
      const validProject = new Project();
      validProject.name = "Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with only from date (openEnd=true)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      flexibleRange.from = new Date('2024-01-01');
      // to is undefined, but openEnd is true
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with only to date (openStart=true)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      // from is undefined, but openStart is true
      flexibleRange.to = new Date('2024-12-31');
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation for flexibleRange with neither date (both open)", async () => {
      const validProject = new Project();
      validProject.name = "Flexible Range Test";
      validProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      validProject.activeRange = activeRange;
      
      const flexibleRange = new DateTimeRangeClass();
      // Both from and to are undefined, but both openStart and openEnd are true
      validProject.flexibleRange = flexibleRange;

      const errors = await validProject.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Invalid Date Validation", () => {
    it("should fail validation with invalid date string", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Invalid Date Test";
      invalidProject.startDate = new Date('invalid-date'); // Invalid date
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const startDateError = summary.find(error => error.field === "startDate");
      expect(startDateError).toBeDefined();
      expect(startDateError?.codes).toContain("isDateWithRange");
    });
  });

  describe("Text Field Validation", () => {
    it("should fail validation when name is too short", async () => {
      const invalidProject = new Project();
      invalidProject.name = "A"; // Too short (minLength is 2)
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const nameError = summary.find(error => error.field === "name");
      expect(nameError).toBeDefined();
      expect(nameError?.codes).toContain("minLength");
    });

    it("should fail validation when name is too long", async () => {
      const invalidProject = new Project();
      invalidProject.name = "A".repeat(101); // Too long (maxLength is 100)
      invalidProject.startDate = new Date('2024-06-15');
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const nameError = summary.find(error => error.field === "name");
      expect(nameError).toBeDefined();
      expect(nameError?.codes).toContain("maxLength");
    });

    it("should fail validation when description is too long", async () => {
      const invalidProject = new Project();
      invalidProject.name = "Description Test";
      invalidProject.startDate = new Date('2024-06-15');
      invalidProject.description = "A".repeat(501); // Too long (maxLength is 500)
      
      const activeRange = new DateTimeRangeClass();
      activeRange.from = new Date('2024-06-15');
      activeRange.to = new Date('2024-09-15');
      invalidProject.activeRange = activeRange;

      const errors = await invalidProject.validate();
      const summary = summarizeErrors(errors);
      
      const descError = summary.find(error => error.field === "description");
      expect(descError).toBeDefined();
      expect(descError?.codes).toContain("maxLength");
    });
  });
});
