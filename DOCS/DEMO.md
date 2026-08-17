# 15-year demo history

Use the Indianapolis demo house. Do not seed fake issues. Upload
the documents in [`DOCS/HouseIQ_Starter_Upload_Batch_36/`](../DOCS/HouseIQ_Starter_Upload_Batch_36/)
in `upload_order` from `starter_upload_batch_36.csv`.

The batch is a longitudinal record, not one inspection plus one
invoice. Later HVAC documents must attach to the furnace and air
conditioner the house already knows.

## Story the documents tell

| Year | Event | What HouseIQ should remember |
|---|---|---|
| 2012 | Pre-purchase inspection + sewer scope | Baseline of the house |
| 2014 | Gas water heater replacement | Water heater asset + warranty |
| 2014 | High-efficiency furnace replacement | The furnace. Later HVAC work belongs here |
| 2017 | Garage roof leak | Garage roof, not the main roof |
| 2018 | AC capacitor failure | Outdoor condenser / AC asset |
| 2019 | Chimney-side roof leak | Chimney, not the 2017 garage leak |
| 2020 | Basement water + sump replacement | Sump / basement water system |
| 2020 | AC refrigerant leak | Same AC as 2018, not a second condenser |
| 2021 | Roof assessment, competing quotes, replacement | One roof project; Skyline quote still attaches |
| 2023 | Furnace blower motor | Same 2014 furnace, not a new furnace |
| 2025 | HVAC annual inspection | Same furnace + same AC |
| 2026 | AC capacitor service | Upload this last in the video |

## Demo questions

After the history is uploaded and accepted:

> What major expenses should I prepare for over the next three years?

Then open **Why HouseIQ knows this** on the Ask answer.

Then run the Memory Auditor:

> Show me everything HouseIQ currently knows about the HVAC system and where that knowledge came from.

Or:

> What evidence supports what HouseIQ believes about the furnace?

## Persistent equipment

HouseIQ should look like this, not like three unrelated furnaces:

```text
FURNACE (2014 Carrier)
├── installed: 2014
├── blower replaced: 2023
└── inspected: 2025

AIR CONDITIONER
├── capacitor: 2018
├── refrigerant service: 2020
├── inspected: 2025
└── capacitor service: 2026
```

The 2026 video upload is also at
[`DOCS/SAMPLE HVAC REPAIR INVOICE.txt`](../DOCS/SAMPLE HVAC REPAIR INVOICE.txt).
