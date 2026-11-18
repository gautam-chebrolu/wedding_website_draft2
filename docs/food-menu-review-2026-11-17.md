# Food menu review — November 17, 2026

Implemented from the supplied `Priya Gautam Lunch - Uthsaav (1).pdf` (4 pages),
`Priya Gautam Reception - Uthsaav (1).pdf` (3 pages), and
`Priya Gautam Sangeet - Uthsaav (1).pdf` (5 pages), each printed November 17.
Haldi follows the organizer’s explicit corrections. Document equipment and
service instructions are not guest menu content.

## Organizer review — resolved

The organizer confirmed the changes below. Bullet naan is restored despite its
omission from the latest PDF. Chole and bhatura are now separate items so chole
can be labeled Gluten-free and included in Gluten-free matches without the bread.

| Event / source | Change or uncertainty | Applied behavior |
| --- | --- | --- |
| Wedding lunch, p. 2 | Tindora fry newly says **Contains Nuts**. Gutti vankaya still contains nuts. | Tindora now displays Contains nuts and is excluded from Nut-free matches. |
| Wedding lunch, p. 4 | Sengapappu karam contains nuts, confirmed by the organizer. | Preserved this nut warning; other powders display Nut-free under the organizer’s rule. No vegetarian, vegan or gluten-free labels were inferred for the powders. |
| Sangeet, p. 3 | Salmon tikka should not be labeled Gluten-free, confirmed by the organizer. | Kept Gluten-free removed. |
| Wedding lunch, p. 2 | Gutti vankaya, Tindora fry and Mango pappu all contain ghee and are not vegan. Mango pappu is now Mango Spinach pappu. | Retained Vegetarian and Gluten-free, removed Vegan, and included spinach in the name and description. |
| Reception, pp. 1–2 | Stuffed mushrooms are now **V, GF**, without the old Vegan label. | Removed Vegan. |
| Reception, p. 2 | **Paneer kadai replaces paneer tikka masala; Tava vegetables replace bhindi masala.** These are substantive dish changes. | Replaced both dishes and their descriptions. |
| Reception, p. 3 | **Mango mousse & berries replaces both kulfi falooda and rabri jalebi.** The PDF spells mousse “Mouse.” | Displayed Mango mousse & berries, Vegetarian and Gluten-free; removed both old desserts. |
| Sangeet, pp. 3–4 | Bullet naan should remain, confirmed by the organizer. The Mexican paneer dishes are described as grilled stuffed tortillas. | Restored Bullet naan at the biryani station and kept the updated tortilla descriptions. Bullet naan has no supplied vegetarian, vegan or gluten-free labels. |
| All events | The organizer explicitly approved labeling dishes Nut-free unless they say Contains nuts. | Kept automatic Nut-free labels and matching for all dishes without a nuts tag, including otherwise untagged dishes. Existing preparation and cross-contact notes remain. |

## Other reconciled changes

- **Haldi:** all nine dishes are Vegetarian; Veg Manchow Soup and veg spring rolls
  are also Vegan; Gajar Halwa contains nuts. No further Vegan or Gluten-free
  labels were inferred.
- **Sangeet:** added fruit/cheese/cracker platters, guacamole, corn bean salad and
  beet salad. Replaced the chaat station’s generic condiments with the listed
  pickle. Added the listed Vegan/Gluten-free labels for pickle, salsa and salads.
  Both raita entries are Vegetarian and Gluten-free. Live kulfi falooda now also
  has its explicit Vegetarian label. Replaced the placeholder mocktail station
  with Guava margarita and Butter beer. Palak chaat’s description includes kale
  as well as spinach, following the PDF.
- **Wedding:** added mango lassi, Badushah, fryums, dry curd chili, papad and four
  karam powders. Replaced the generic dosa chutney with coconut chutney, tomato
  chutney, sambhar and potato filling. Added the latest explicit labels for
  breakfast coconut chutney, panakam, moong dal kosambari, Chikkudukaya, yogurt
  rice and Mysore pak. Payasam is now specifically Semiya & sabudana payasam
  (vermicelli and tapioca pearls); Rava kesari’s description includes pineapple.
- **Reception:** added bruschetta and Hara bara kabab. Pickle is now explicitly
  Vegan and Gluten-free. Raita is Vegetarian and Gluten-free.
- **Resolved old conflicts:** yogurt rice and reception raita no longer say
  Vegan in the latest PDFs, so their old review warnings were removed.
- **Dairy-free:** removed from data, dish labels, filter choices and matching.
  The sole explicit DF annotation in the latest documents is for chole bhatura;
  it does not imply a Vegan label. Chole is a separate Vegetarian, Gluten-free
  item with a note to serve without bhatura. Bhatura is Vegetarian and does not
  match Gluten-free.

## Verification

Regenerated all three guest menu pages. `node --test scripts/tests/food.test.js`
passes all eight checks, including dietary filtering, combined selections,
nut exclusions, Haldi corrections, resolved yogurt labels, Dairy-free removal,
separate chole/bhatura filtering and restored Bullet naan.
