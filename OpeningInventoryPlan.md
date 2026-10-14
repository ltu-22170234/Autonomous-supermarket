# Opening inventory and purchase-cost review

Reviewed on **14 October 2026** for the fictional 60-product Melbourne CBD convenience store. This is a more conservative planning scenario, not a set of contracted supplier prices or a complete real-store startup budget.

The revised editable catalogue costs **A$14,618.10** for **4,604 opening units**, leaving **A$25,381.90** within the **A$40,000 inventory maximum**. Opening operating cash remains a separate **A$15,000**. Unused inventory budget does not become cash. The range remains 60 products across eight categories, and runs still cover 60 days.

## Buying-cost and shelf-price basis

The original catalogue used fictional purchase prices with large margins. The revised catalogue uses indicative convenience-store shelf prices, checked against representative Australian listings, and more conservative estimated buying costs. Most products use the category percentages below, rounded **up** to the next five cents. These percentages are explicit modelling assumptions, not measured industry margins or wholesale discounts promised by a supplier.

| Category | Estimated purchase cost as a share of shelf price |
| --- | ---: |
| Grocery and pantry | 75% |
| Drinks | 65% |
| Snacks and confectionery | 70% |
| Dairy and chilled | 80% |
| Fresh and bakery | 70% |
| Ready-to-eat food | 70% |
| Household essentials | 75% |
| Personal and convenience | 75% |

Water and 45 g chips use public carton-price benchmarks instead of the category percentage. Rounding A$13/24 and A$26/18 upward to five-cent unit costs gives **A$0.55 per water bottle** and **A$1.45 per chip packet**. The unit rounding makes the model's carton totals slightly higher than the listed prices.

| Public benchmark | Observed listing | How it informs the scenario |
| --- | --- | --- |
| [B&N Melbourne Spring Water](https://www.bandn.com.au/product-page/melbourne-spring-water) | A$13 for 24 × 600 mL; confirm availability and freight | Water purchase-cost benchmark and 24-unit opening pack |
| [Moco Smiths Original Chips](https://www.mocofoodservices.com.au/pantry/snacks--confectionary/chips-original-45gm3/) | A$26 for 18 × 45 g; the listing marks special pricing | Chips buying-cost benchmark and 18-unit opening pack; recheck a regular supplier quote |
| [Harris Farm Swords Long Grain Rice](https://www.harrisfarm.com.au/products/swords-rice-long-grain) | Indicative A$3.99 for 1 kg; local prices can vary | Generic model rice sells for A$4.00; its A$3.00 purchase cost is estimated |
| [IGA Mighty Soft White Sandwich Bread](https://www.igashop.com.au/product/mighty-soft-white-sandwich-860353) | A$3.90 for 650 g | Comparable pack-size reference for the model's A$4.00 white loaf |
| [IGA a2 Full Cream Milk](https://www.igashop.com.au/product/a2-milk-full-cream-882575) | A$4.10 for 1 L | Premium milk reference; the generic model uses A$3.50 retail and estimated A$2.80 buying cost |
| [IGA Simply Tasty Chicken Parmi & Mash](https://www.igashop.com.au/product/simply-tasty-chicken-parmi-mash-7162) | A$9.00 for 400 g | Comparable ready-meal reference; model meal sizes and recipes differ |
| [Harris Farm Banana Each](https://www.harrisfarm.com.au/collections/fruit-delivery/products/banana-4211) | A$0.99 per banana on the retrieved listing | Fresh-fruit reference; A$1.20 is an assumed convenience-store shelf price |
| [IGA Colgate Advanced Whitening](https://www.igashop.com.au/product/colgate-advanced-whitening-toothpaste-514847) | A$7.00 for 115 g | Branded personal-care reference; the model's generic 100 g toothpaste uses A$5.00 retail |

These listings are representative Australian benchmarks, not an identical 60-item Melbourne basket. Retail references do not establish wholesale costs. Shelf prices, procurement percentages, brands, delivery terms and availability need confirmation before real purchasing. October 2026 price benchmarks are applied to the hypothetical scenario, not claimed as historical January 2026 prices. Freight, rebates, container deposits and GST are not separately reconciled.

## Opening-stock calculation

The revised plan replaces `2 × popularity × cover` with approximate customer demand:

1. Use default 160 weekday and 130 weekend customers, weighted over five weekdays and two weekend days.
2. Use each mission's probability, mean basket-line count and category weights. Expected units per line are **1.15**, from 85% one-unit and 15% two-unit requests.
3. Allocate category demand across products using relative popularity.
4. Apply a **10% opening-planning allowance**, then multiply by the cover below.
5. Cap perishable cover at **shelf life minus one day**, with a one-day minimum. Round non-perishables to opening buying packs; keep perishables in individual units to avoid forced excess stock.

Category allocation approximates the simulator's selection without replacement. It is a declared forecast assumption, not observed real-world demand. Quantities are seeded for the default customer bases; changing a run's customer settings does not automatically rebuild the catalogue. Review the opening quantities when changing the scenario.

| Category | Opening cover | Opening pack assumption | Opening units | Purchase cost |
| --- | --- | --- | ---: | ---: |
| Grocery and pantry | 10 days | 6 units | 1,050 | A$3,093.00 |
| Drinks | 10 days; chilled products obey shelf-life limits | 24 for non-perishables; individual chilled units | 1,066 | A$2,272.30 |
| Snacks and confectionery | 10 days | 12 units; 18 for 45 g chips | 600 | A$1,368.60 |
| Dairy and chilled | Up to 3 days | Individual units | 228 | A$772.40 |
| Fresh and bakery | Up to 2 days | Individual units | 150 | A$294.30 |
| Ready-to-eat food | Up to 2 days | Individual units | 100 | A$574.80 |
| Household essentials | 14 days | 6 units | 816 | A$3,882.90 |
| Personal and convenience | 14 days | 6 units | 594 | A$2,359.80 |
| **Total** | | | **4,604** | **A$14,618.10** |

Except for water and chips, buying packs are assumptions. Later replenishment continues to order individual units under the existing Brain rules. Shelf capacity, supplier minimum orders, mixed-age opening batches and delivery delays remain outside the prototype. Quantities are not increased merely to spend A$40,000.

Rice has about 10.50 expected units/day, or 11.55 with the allowance. Ten days gives about 115.48 units, rounded to **120**, costing **A$360.00**. A two-day sandwich has one day of cover: about 11.92 planning units/day becomes **12** opening units at **A$5.55**, costing **A$66.60**.

## Applying the change and keeping historical evidence

This workspace's editable SQLite catalogue is already updated. Fresh databases seed it automatically. The future-run model is **1.2.0**; the simulation engine stays **1.1.0**, since daily execution rules are unchanged.

For another copy containing the original unedited catalogue, run from the project root:

```sh
npm --prefix backend run update:opening-inventory
```

The update validates the budget and updates the editable catalogue and its seed marker. It verifies a fingerprint of every stored run and supporting history table before committing. It is safe to repeat. Custom catalogue edits cause a rollback and are left for manual review. Original inputs are retained in `backend/data/catalogue-v1.json`.

The existing **Submitted Run remains model 1.0.0 with its original A$3,143.90 opening inventory**. Its Run ID, designation, snapshots, report figures and audit evidence are preserved. Create a separate run to obtain reports using this catalogue and review its assurance before deciding whether to designate it as Submitted.

## Revised product plan

The following table records all current seed inputs and resulting opening costs. Most buying costs remain estimates as described above.

| ID | Product | Buying cost / unit | Shelf price | Opening units | Opening cost |
| --- | --- | ---: | ---: | ---: | ---: |
| P001 | Long grain rice — 1 kg | A$3.00 | A$4.00 | 120 | A$360.00 |
| P002 | Penne pasta — 500 g | A$1.90 | A$2.50 | 120 | A$228.00 |
| P003 | Rolled oats — 750 g | A$3.40 | A$4.50 | 90 | A$306.00 |
| P004 | Canned tomatoes — 400 g | A$1.50 | A$2.00 | 120 | A$180.00 |
| P005 | Baked beans — 420 g | A$1.90 | A$2.50 | 90 | A$171.00 |
| P006 | Canned tuna — 95 g | A$2.40 | A$3.20 | 120 | A$288.00 |
| P007 | Peanut butter — 375 g | A$3.75 | A$5.00 | 90 | A$337.50 |
| P008 | Pasta sauce — 500 g | A$3.40 | A$4.50 | 90 | A$306.00 |
| P009 | Breakfast cereal — 500 g | A$4.90 | A$6.50 | 60 | A$294.00 |
| P010 | Instant noodles — 5 × 85 g | A$4.15 | A$5.50 | 150 | A$622.50 |
| P011 | Still water — 600 mL | A$0.55 | A$2.00 | 144 | A$79.20 |
| P012 | Sparkling water — 500 mL | A$1.85 | A$2.80 | 96 | A$177.60 |
| P013 | Cola — 375 mL | A$1.95 | A$3.00 | 120 | A$234.00 |
| P014 | Sugar-free cola — 375 mL | A$1.95 | A$3.00 | 120 | A$234.00 |
| P015 | Orange juice — 500 mL chilled | A$2.95 | A$4.50 | 76 | A$224.20 |
| P016 | Iced coffee — 500 mL chilled | A$2.95 | A$4.50 | 126 | A$371.70 |
| P017 | Energy drink — 250 mL | A$2.95 | A$4.50 | 120 | A$354.00 |
| P018 | Sports drink — 600 mL | A$2.95 | A$4.50 | 96 | A$283.20 |
| P019 | Iced tea — 500 mL | A$2.30 | A$3.50 | 96 | A$220.80 |
| P020 | Apple juice box — 250 mL | A$1.30 | A$2.00 | 72 | A$93.60 |
| P021 | Potato chips — 45 g | A$1.45 | A$3.00 | 108 | A$156.60 |
| P022 | Corn chips — 175 g | A$3.15 | A$4.50 | 72 | A$226.80 |
| P023 | Milk chocolate bar — 50 g | A$2.10 | A$3.00 | 108 | A$226.80 |
| P024 | Muesli bar — 35 g | A$1.40 | A$2.00 | 72 | A$100.80 |
| P025 | Mixed nuts — 100 g | A$3.85 | A$5.50 | 72 | A$277.20 |
| P026 | Crackers — 200 g | A$2.45 | A$3.50 | 48 | A$117.60 |
| P027 | Fruit gummies — 100 g | A$2.25 | A$3.20 | 72 | A$162.00 |
| P028 | Popcorn — 80 g | A$2.10 | A$3.00 | 48 | A$100.80 |
| P029 | Full cream milk — 1 L | A$2.80 | A$3.50 | 44 | A$123.20 |
| P030 | Low fat milk — 1 L | A$2.80 | A$3.50 | 26 | A$72.80 |
| P031 | Greek yoghurt — 170 g | A$2.40 | A$3.00 | 35 | A$84.00 |
| P032 | Fruit yoghurt — 160 g | A$2.40 | A$3.00 | 26 | A$62.40 |
| P033 | Cheddar cheese — 250 g | A$4.80 | A$6.00 | 26 | A$124.80 |
| P034 | Butter — 250 g | A$4.40 | A$5.50 | 18 | A$79.20 |
| P035 | Free-range eggs — 6 pack | A$4.40 | A$5.50 | 35 | A$154.00 |
| P036 | Hummus — 200 g | A$4.00 | A$5.00 | 18 | A$72.00 |
| P037 | Banana — 1 piece | A$0.85 | A$1.20 | 30 | A$25.50 |
| P038 | Apple — 1 piece | A$1.05 | A$1.50 | 24 | A$25.20 |
| P039 | Orange — 1 piece | A$1.05 | A$1.50 | 18 | A$18.90 |
| P040 | White bread loaf — 650 g | A$2.80 | A$4.00 | 24 | A$67.20 |
| P041 | Wholemeal bread loaf — 650 g | A$3.15 | A$4.50 | 18 | A$56.70 |
| P042 | Croissant — 1 piece | A$2.45 | A$3.50 | 12 | A$29.40 |
| P043 | Cherry tomatoes — 250 g | A$3.15 | A$4.50 | 12 | A$37.80 |
| P044 | Mixed salad leaves — 100 g | A$2.80 | A$4.00 | 12 | A$33.60 |
| P045 | Chicken sandwich — 1 chilled pack | A$5.55 | A$7.90 | 12 | A$66.60 |
| P046 | Vegetarian sandwich — 1 chilled pack | A$5.25 | A$7.50 | 8 | A$42.00 |
| P047 | Chicken wrap — 1 chilled pack | A$5.95 | A$8.50 | 12 | A$71.40 |
| P048 | Falafel wrap — 1 chilled pack | A$5.60 | A$8.00 | 8 | A$44.80 |
| P049 | Chicken rice meal — 350 g chilled | A$6.65 | A$9.50 | 20 | A$133.00 |
| P050 | Pasta meal — 350 g chilled | A$6.30 | A$9.00 | 15 | A$94.50 |
| P051 | Sushi rolls — 2 chilled rolls | A$5.95 | A$8.50 | 10 | A$59.50 |
| P052 | Fruit salad — 250 g chilled | A$4.20 | A$6.00 | 15 | A$63.00 |
| P053 | Toilet tissue — 4 rolls | A$4.90 | A$6.50 | 294 | A$1440.60 |
| P054 | Dishwashing liquid — 500 mL | A$3.40 | A$4.50 | 222 | A$754.80 |
| P055 | Laundry liquid — 1 L | A$7.50 | A$10.00 | 150 | A$1125.00 |
| P056 | Kitchen paper — 2 rolls | A$3.75 | A$5.00 | 150 | A$562.50 |
| P057 | Toothpaste — 100 g | A$3.75 | A$5.00 | 162 | A$607.50 |
| P058 | Hand soap — 250 mL | A$3.40 | A$4.50 | 162 | A$550.80 |
| P059 | Deodorant — 50 mL roll-on | A$4.90 | A$6.50 | 108 | A$529.20 |
| P060 | Sanitary pads — 10 pack | A$4.15 | A$5.50 | 162 | A$672.30 |
