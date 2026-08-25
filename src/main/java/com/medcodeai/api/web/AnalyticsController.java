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

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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
                    + "imported-from-iMed and coder-assigned rows alike.\n"
                    + "- `documentationGaps` — what incomplete cases are missing, per item and "
                    + "per disease group (incomplete vs total).\n"
                    + "- `codingActivity` — approve / code-assign / reopen actions per day from "
                    + "the audit trail, same `days` window, zero-filled.\n"
                    + "- `turnaround` — sync-to-first-approval median and p90 in minutes; both "
                    + "null with `cases: 0` until something is approved.\n"
                    + "- `codingDepth` — codes-per-case distribution (buckets 0 / 1 / 2 / 3-5 / "
                    + "6+), the uncoded backlog, the average, and the code-role mix.\n"
                    + "- `caseMix` — disease group × severity, plus sex and age-band splits.\n"
                    + "- `topPrincipalDiagnosis` — the same row shape as `topCodes`, but ICD-10 "
                    + "rows in the `principal_diagnosis` role only, so a frequent procedure or "
                    + "comorbidity cannot outrank a diagnosis.\n"
                    + "- `coderKpi` — per coder: `finishedPct` (finished ÷ **touched**, because "
                    + "no assignment system exists — `touched` ships so the UI can name its own "
                    + "denominator) and `within7DaysPct` (finished inside 7 days ÷ `measured`, "
                    + "the finished cases that also have a sync event). Both are null, never 0, "
                    + "when their denominator is empty.\n"
                    + "- `range` — the window actually applied, echoed back.\n\n"
                    + "`days` defaults to 30 (max 365), `topCodes` to 10 (max 50).\n\n"
                    + "**Date filter.** `from` and `to` (ISO `YYYY-MM-DD`, inclusive) must be "
                    + "given together or not at all, and may not span more than 365 days. "
                    + "Without them nothing is filtered and `summary` is the Dashboard's own "
                    + "`stats` verbatim. With them EVERY card is scoped to the window — the case "
                    + "population by visit date, the coder cards by action date — and `summary` "
                    + "is recomputed in SQL over the same queue routing. `days` is then ignored: "
                    + "the series spans the range instead.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {
                      "summary": {"total": 21, "complete": 6, "incomplete": 15, "reopened": 0,
                                  "finished": 0, "notFinished": 21, "finishedPct": 0.0},
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
                      ],
                      "topPrincipalDiagnosis": [
                        {
                          "label": "I10 · Essential HT",
                          "count": 9,
                          "code": "I10",
                          "system": "ICD-10",
                          "description": "Essential HT"
                        }
                      ],
                      "coderKpi": [
                        {
                          "coder": "Frank",
                          "coderId": "frank@medcodeai.demo",
                          "touched": 25,
                          "finished": 20,
                          "finishedPct": 80.0,
                          "measured": 20,
                          "within7Days": 17,
                          "within7DaysPct": 85.0
                        }
                      ],
                      "range": {"filtered": false, "from": "2026-07-27", "to": "2026-08-25"}
                    }
                    """)))
    public Map<String, Object> analytics(
            @RequestParam(value = "days", defaultValue = "" + AnalyticsService.DEFAULT_DAYS) int days,
            @RequestParam(value = "topCodes",
                    defaultValue = "" + AnalyticsService.DEFAULT_TOP_CODES) int topCodes,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (days < 1 || days > MAX_DAYS) {
            throw new ApiExceptionHandler.BadRequestException("days must be between 1 and " + MAX_DAYS);
        }
        if (topCodes < 1 || topCodes > MAX_TOP_CODES) {
            throw new ApiExceptionHandler.BadRequestException(
                    "topCodes must be between 1 and " + MAX_TOP_CODES);
        }
        // Both or neither: one bare endpoint of a range has no defensible
        // default — silently treating "from" alone as "from … forever" would
        // quietly disagree with the label the page prints above the tiles.
        if ((from == null) != (to == null)) {
            throw new ApiExceptionHandler.BadRequestException(
                    "from and to must be given together");
        }
        if (from != null) {
            if (from.isAfter(to)) {
                throw new ApiExceptionHandler.BadRequestException("from must not be after to");
            }
            // The series carries one point per day, so the range is bounded by
            // the same guard rail as `days`.
            long span = ChronoUnit.DAYS.between(from, to) + 1;
            if (span > MAX_DAYS) {
                throw new ApiExceptionHandler.BadRequestException(
                        "the range must not exceed " + MAX_DAYS + " days");
            }
        }
        return analytics.build(days, topCodes, from, to, LocalDate.now());
    }
}
