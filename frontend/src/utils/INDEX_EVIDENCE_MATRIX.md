# Index Evidence Matrix (Recuperacao + Capacidade)

Matriz oficial de governanca de indices para garantir rastreabilidade de fonte, proxy, interpolacao e confianca.

## Politicas gerais

- `score_with_penalty`: permite score com penalidade de confianca quando houver interpolacao/proxy validado.
- `visual_only`: interpolacao pode aparecer no grafico, mas nao entra em componente clinico do score.
- `none`: nao aceita interpolacao no score; exige dado real para computo.

## Recuperacao

| Indice | Fontes primarias | Proxy aceito | Interpolacao | Min inputs | Readiness key |
|---|---|---|---|---:|---|
| NightQuality | sleepEfficiencyPct, sleepDeepHours, sleepRemHours, sleepAwakeHours, respiratoryDisturbances, spo2 | nenhum | score_with_penalty | 4 | nightQualityIndex |
| RecoveryIndex | sleepQualityScore, sleepDebt7d, hrvSdnn, restingHeartRate, pulseTemperatureC | pulseTemperatureProxy | score_with_penalty | 3 | recoveryIndex |
| SleepRegularity | sleepStartAt, sleepEndAt | nenhum | none | 5 noites | sleepRegularityIndex |
| AutonomicBalance | hrvSdnn, restingHeartRate | nenhum | score_with_penalty | 2 | autonomicBalanceChart |
| HRVVariability | hrvSdnn | nenhum | score_with_penalty | 1 | hrvVariabilityChart |
| HRRange | heartRateMin, heartRateMax, heartRateMean, restingHeartRate | nenhum | visual_only | 1 | hrRangeChart |

## Capacidade

| Indice | Fontes primarias | Proxy aceito | Interpolacao | Min inputs | Readiness key |
|---|---|---|---|---:|---|
| ActivityReadiness | steps, activeEnergyKcal, walkingSpeedKmh, walkingStepLengthCm, walkingAsymmetryPct, physicalEffort | nenhum | visual_only | 3 | activityReadinessIndex |
| FunctionalCapacityIndex | restingHeartRate, walkingHeartRateAvg, sixMinuteWalkMeters, cardioRecoveryBpm, vo2Max | vo2FromRhr | visual_only | 3 | functionalCapacityIndex |
| CircadianRobustness | sleepStartAt, sleepEndAt, daylightMinutes, heartRateMean, restingHeartRate, pulseTemperatureC | pulseTemperatureProxy | score_with_penalty | 3 | circadianRobustnessIndex |
| MovementEfficiency | walkingAsymmetryPct, walkingDoubleSupportPct, walkingSpeedKmh, walkingStepLengthCm, runningGroundContactTimeMs | nenhum | visual_only | 3 | movementEfficiencyIndex |

## Regra de elegibilidade

- `standby`: indice nao elegivel (`reason=insufficient_readiness`).
- `collecting/exploratory/robust`: indice elegivel se cumprir `minimumInputs`.
- ausencia estrutural de dado prevalece sobre interpolacao: manter `score=null` com `reason` explicito.
