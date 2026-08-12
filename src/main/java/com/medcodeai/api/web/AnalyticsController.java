package com.medcodeai.api.web;

import com.medcodeai.api.service.AnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

/**
 * The Analytics page payload. One endpoint for the whole page: the four cards
 * are read together on every load, and splitting them would cost four round
 * trips for four grouped scans of the same small table.
 */
@RestController
@Tag(name = "analytics", description = "Roll-ups over the synced hospital data")
@SecurityRequirement(name = "bearerAuth")
public class AnalyticsController {

    /** Guard rails: a year of daily points, and a bar list that still fits. */
    private static final int MAX_DAYS = 365;
    private static final int MAX_TOP_CODES = 50;

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/api/analytics")
    @Operation(summary = "Analytics page payload",
            description = "Roll-ups over **OPD visits only** (`encountertype = '0'`), the same "
                    + "population `GET /api/cases` serves.\n\n"
                    + "- `summary` — the dashboard's own `stats` object verbatim, so the tiles "
                    + "cannot drift from the Dashboard. `reopened` is its own queue: only "
                    + "`total` covers all four.\n"
                    + "- `casesOverTime` — one point per day for the last `days` days ending "
                    + "today, inclusive, zero-filled. A visit is dated by `admissiondatetime`, "
                    + "else by the datetime encoded in its transaction number (positions 4-15) "
                    + "— the same rule imed-mock-api applies to its visit-date window. `iso` is "
                    + "local midnight with no zone suffix.\n"
                    + "- `coverageCounts` — visits per สิทธิการรักษา scheme family (UCS / OFC / "
                    + "WEL / …), biggest first; blank coverage groups under `ไม่ระบุสิทธิ`.\n"
                    + "- `topCodes` — most-assigned codes across both catalogs, counting "
                    + "imported-from-iMed and coder-assigned rows alike.\n\n"
                    + "`days` defaults to 30 (max 365), `topCodes` to 10 (max 50).")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "summary": {"total": 21, "complete": 6, "incomplete": 15, "reopened": 0, "finished": 0},
                      "casesOverTime": [
                        {"iso": "2026-07-22T00:00:00", "count": 1},
                        {"iso": "2026-07-23T00:00:00", "count": 1}
                      ],
                      "coverageCounts": [
                        {"label": "OFC", "count": 5},
                        {"label": "ไม่ระบุสิทธิ", "count": 9}
                      ],
                      "topCodes": [
                        {
                          "label": "D17.1 · lipoma at back",
                          "count": 2,
                          "code": "D17.1",
                          "system": "ICD-10",
                          "description": "lipoma at back"
                        }
                      ]
                    }
                    """)))
    public Map<String, Object> analytics(
            @RequestParam(value = "days", defaultValue = "" + AnalyticsService.DEFAULT_DAYS) int days,
            @RequestParam(value = "topCodes",
                    defaultValue = "" + AnalyticsService.DEFAULT_TOP_CODES) int topCodes) {
        if (days < 1 || days > MAX_DAYS) {
            throw new ApiExceptionHandler.BadRequestException("days must be between 1 and " + MAX_DAYS);
        }
        if (topCodes < 1 || topCodes > MAX_TOP_CODES) {
            throw new ApiExceptionHandler.BadRequestException(
                    "topCodes must be between 1 and " + MAX_TOP_CODES);
        }
        return analytics.build(days, topCodes, LocalDate.now());
    }
}
