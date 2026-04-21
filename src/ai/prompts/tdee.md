# Task

Estimate my TDEE from the inputs below.

## Rules

- Output only valid JSON that matches the given response schema.
- Use metric units.
- Make conservative assumptions if something is unknown; do not ask follow-up questions.
- Prefer a data-driven estimate from my history window when possible (weight + calories).
- If the history window is insufficient, fall back to a formula-based estimate using the app estimates.
- When using history, estimate the TDEE that best explains the weight trend given logged calories. Assume about `7700 kcal` per `1 kg` of body mass change as a rough energy-equivalent.
- If a day in the history window has calories but no logged weight, assume it uses the previous logged day's weight.
- Keep `tdeeKcal` within {{tdeeMin}}-{{tdeeMax}} kcal/day.
- If you choose an activity multiplier, return it, or `null` if you avoid a multiplier.
- Make `assumptions` useful, specific, and directly about the TDEE estimate itself, not generic diet advice.
- Do not include calorie-target advice, deficit/surplus coaching, or target-weight strategy inside `assumptions`.
- Include 4-6 assumption strings.
- Each assumption should be a full, concise sentence.
- At least one assumption must explain which evidence mattered most from the history window.
- At least one assumption must compare your final estimate against the app anchors (`observedTdee` and/or formula estimates) and say clearly why your final TDEE is higher, lower, or similar.
- When possible, mention concrete inputs such as calories, weight trend, activity description, or formula/observed values.

## Inputs

- Sex: {{sex}}
- Age: {{age}}
- Height: {{heightCm}} cm
- Current weight: {{currentWeightKg}} kg
- Target weight: {{targetWeightKg}} kg
- Goal mode: {{goalMode}}

## Activity / Lifestyle

{{activityBlock}}

## History Window

Most recent days with both weight and calories:

{{historyLines}}

## App Estimates

- Formula TDEE average: {{formulaTdeeAverage}} kcal/day
- Formula breakdown: {{formulaBreakdown}}
- Observed TDEE: {{observedTdee}} kcal/day

## Compute

- `tdeeKcal`: one final estimated TDEE number in kcal/day
- `recommendedCaloriesKcal`: a conservative daily calorie target based on goal mode, even if target weight is not set
- `assumptions`: 4-6 concise but descriptive sentences explaining why this TDEE was chosen
