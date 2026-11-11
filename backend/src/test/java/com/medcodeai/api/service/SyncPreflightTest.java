package com.medcodeai.api.service;

import com.medcodeai.api.client.HospitalApiException;
import com.medcodeai.api.client.ImedApiClient;
import com.medcodeai.api.repo.CodingRepository;
import com.medcodeai.api.repo.IcdCatalogRepository;
import com.medcodeai.api.repo.SyncRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** R6 failing stops the sync before any case is fetched, as a hospital error naming the fields. */
class SyncPreflightTest {

    @Test
    void aFailedContractCheckStopsTheSyncAndNamesTheMissingFields() {
        ImedApiClient imed = mock(ImedApiClient.class);
        when(imed.contractCheck(any())).thenReturn(
                Map.of("valid", false, "missing", List.of("visit.visit_id")));
        SyncService sync = new SyncService(imed, mock(SyncRepository.class),
                mock(CodingRepository.class), mock(IcdCatalogRepository.class),
                mock(WriteGate.class), mock(CasesCache.class),
                mock(PlatformTransactionManager.class));

        HospitalApiException e = assertThrows(HospitalApiException.class,
                () -> sync.syncAll("2026-11-01", "2026-11-01"));

        assertTrue(e.getMessage().contains("visit.visit_id"), e.getMessage());
        verify(imed, never()).syncByPeriod(any(), any());
        verify(imed, never()).syncCases(any());
    }
}
