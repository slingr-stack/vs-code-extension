import { Field, Model, BaseModel, DateTimeRange, DateTimeRangeType } from "../../index";

@Model({
	docs: "Test model for DateTimeRange with array support checks",
})
class DateTimeRangeArrayModel extends BaseModel {
	@Field({})
	@DateTimeRange({ from: true, to: true })
	dateRanges!: DateTimeRangeType[];
}

describe("DateTimeRange decorator with array values (DateTimeRangeType[])", () => {
	it("should pass validation for arrays (array of DateTimeRange is now supported)", async () => {
		const m = new DateTimeRangeArrayModel();

		const r1 = new DateTimeRangeType();
		r1.from = new Date("2024-01-01T00:00:00Z");
		r1.to = new Date("2024-01-31T23:59:59Z");

		const r2 = new DateTimeRangeType();
		r2.from = new Date("2024-02-01T00:00:00Z");
		r2.to = new Date("2024-02-28T23:59:59Z");

		m.dateRanges = [r1, r2];

		const errors = await m.validate();
		// Should pass validation now that array support is implemented
		expect(errors.length).toBe(0);
	});

	it("should still serialize and deserialize array items to ISO strings and back to Date objects", async () => {
		const m = new DateTimeRangeArrayModel();

		const r1 = new DateTimeRangeType();
		r1.from = new Date("2024-03-01T00:00:00Z");
		r1.to = new Date("2024-03-31T23:59:59Z");

		const r2 = new DateTimeRangeType();
		r2.from = new Date("2024-04-01T00:00:00Z");
		r2.to = new Date("2024-04-30T23:59:59Z");

		m.dateRanges = [r1, r2];

		// toJSON should include ISO strings for inner Date fields
		const json = m.toJSON();
		expect(Array.isArray(json.dateRanges)).toBe(true);
		expect(json.dateRanges[0].from).toBe("2024-03-01T00:00:00.000Z");
		expect(json.dateRanges[0].to).toBe("2024-03-31T23:59:59.000Z");
		expect(json.dateRanges[1].from).toBe("2024-04-01T00:00:00.000Z");
		expect(json.dateRanges[1].to).toBe("2024-04-30T23:59:59.000Z");

		// fromJSON should rehydrate to DateTimeRangeType instances with Date fields
		const restored = DateTimeRangeArrayModel.fromJSON(json);
		expect(Array.isArray(restored.dateRanges)).toBe(true);
		expect(restored.dateRanges[0]).toBeInstanceOf(DateTimeRangeType);
		expect(restored.dateRanges[0]!.from).toBeInstanceOf(Date);
		expect(restored.dateRanges[0]!.to).toBeInstanceOf(Date);
		expect(restored.dateRanges[1]).toBeInstanceOf(DateTimeRangeType);
		expect(restored.dateRanges[1]!.from).toBeInstanceOf(Date);
		expect(restored.dateRanges[1]!.to).toBeInstanceOf(Date);
	});
});

