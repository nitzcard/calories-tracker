# Task

Estimate my TDEE from the inputs below.

## Rules

- Output only valid JSON that matches the given response schema.
- Use metric units.
- Make conservative assumptions if something is unknown; do not ask follow-up questions.
- Prefer a data-driven estimate from my history window when possible (weight + calories).
- If the history window is insufficient, fall back to a formula-based estimate using the app estimates.
- When using history, estimate the TDEE that best explains the weight trend given logged calories. Assume about `7700 kcal` per `1 kg` of body mass change as a rough energy-equivalent.
- Keep `tdeeKcal` within {{tdeeMin}}-{{tdeeMax}} kcal/day.
- If you choose an activity multiplier, return it, or `null` if you avoid a multiplier.

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
- `assumptions`: short bullet-style strings with your key assumptions
