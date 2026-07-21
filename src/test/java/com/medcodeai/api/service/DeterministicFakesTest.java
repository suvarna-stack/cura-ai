package com.medcodeai.api.service;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Replays scripts/gen_fakes_golden.py output (every real case id) through the
 * Java port. Any drift from sync/views.py fails here before it can reach the
 * HTTP parity gate.
 */
class DeterministicFakesTest {

    @Test
    void matchesPythonGoldenValues() {
        var in = getClass().getResourceAsStream("/fakes-golden.json");
        assertNotNull(in, "fakes-golden.json missing — run scripts/gen_fakes_golden.py");
        JsonNode golden = new JsonMapper().readTree(in);
        assertTrue(golden.size() > 1000, "golden file should cover all ~1150 cases");

        for (var e : golden.properties()) {
            String id = e.getKey();
            JsonNode g = e.getValue();
            String sex = g.get("sex").isNull() ? null : g.get("sex").asString();
            String severity = g.get("severity").isNull() ? null : g.get("severity").asString();

            assertEquals(g.get("conf").asInt(), DeterministicFakes.conf(id, severity), id + " conf");
            assertEquals(g.get("name").asString(), DeterministicFakes.fakeName(id, sex), id + " name");
            assertEquals(g.get("hn").asString(), DeterministicFakes.fakeHn(id), id + " hn");
            String[] dates = DeterministicFakes.fakeDates(id);
            assertEquals(g.get("created").asString(), dates[0], id + " created");
            assertEquals(g.get("updated").asString(), dates[1], id + " updated");
            assertEquals(g.get("revenue").asString(),
                    DeterministicFakes.revenueImpact(id, severity), id + " revenue");
            assertEquals(g.get("demoCoder").asString(),
                    DeterministicFakes.displayCoder(id, "demo.coder"), id + " demoCoder");
        }
    }
}
