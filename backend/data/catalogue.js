// Fictional, reviewed pack sizes and AUD prices for model
// Columns: name, pack, cost cents, sell cents, popularity, shelf life (null = non-perishable)

const groups = {
      pantry: [
    ['Long grain rice','1 kg',180,320,4,null], ['Penne pasta','500 g',110,240,4,null],
    ['Rolled oats','750 g',220,420,3,null], ['Canned tomatoes','400 g',95,190,4,null],
    ['Baked beans','420 g',120,250,3,null], ['Canned tuna','95 g',145,290,4,null],
    ['Peanut butter','375 g',260,480,3,null], ['Pasta sauce','500 g',230,450,3,null],
    ['Breakfast cereal','500 g',340,620,2,null], ['Instant noodles','5 × 85 g',220,440,5,null],
  ],
  drinks: [
    ['Still water','600 mL',45,180,5,null], ['Sparkling water','500 mL',85,250,3,null],
    ['Cola','375 mL',90,260,4,null], ['Sugar-free cola','375 mL',90,260,4,null],
    ['Orange juice','500 mL chilled',190,420,3,10], ['Iced coffee','500 mL chilled',210,450,5,10],
    ['Energy drink','250 mL',170,390,4,null], ['Sports drink','600 mL',165,380,3,null],
    ['Iced tea','500 mL',145,340,3,null], ['Apple juice box','250 mL',65,190,2,null],
  ],
  snacks: [
    ['Potato chips','45 g',80,240,5,null], ['Corn chips','175 g',180,390,3,null],
    ['Milk chocolate bar','50 g',95,260,5,null], ['Muesli bar','35 g',65,180,3,null],
    ['Mixed nuts','100 g',230,470,3,null], ['Crackers','200 g',150,320,2,null],
    ['Fruit gummies','100 g',115,290,3,null], ['Popcorn','80 g',95,250,2,null],
  ],
  dairy: [
    ['Full cream milk','1 L',150,290,5,8], ['Low fat milk','1 L',150,290,3,8],
    ['Greek yoghurt','170 g',110,270,4,12], ['Fruit yoghurt','160 g',95,240,3,12],
    ['Cheddar cheese','250 g',270,520,3,25], ['Butter','250 g',240,460,2,30],
    ['Free-range eggs','6 pack',240,490,4,21], ['Hummus','200 g',220,450,2,10],
  ],
  fresh: [
    ['Banana','1 piece',45,110,5,4], ['Apple','1 piece',55,130,4,7],
    ['Orange','1 piece',50,120,3,8], ['White bread loaf','650 g',160,340,4,4],
    ['Wholemeal bread loaf','650 g',180,370,3,4], ['Croissant','1 piece',105,290,4,2],
    ['Cherry tomatoes','250 g',180,380,2,5], ['Mixed salad leaves','100 g',165,360,2,3],
  ],
  ready_meals: [
    ['Chicken sandwich','1 chilled pack',320,690,5,2], ['Vegetarian sandwich','1 chilled pack',285,640,3,2],
    ['Chicken wrap','1 chilled pack',350,750,5,2], ['Falafel wrap','1 chilled pack',310,690,3,2],
    ['Chicken rice meal','350 g chilled',430,890,4,4], ['Pasta meal','350 g chilled',380,820,3,4],
    ['Sushi rolls','2 chilled rolls',360,780,4,2], ['Fruit salad','250 g chilled',250,550,3,3],
  ],
  household: [
    ['Toilet tissue','4 rolls',260,520,4,null], ['Dishwashing liquid','500 mL',170,390,3,null],
    ['Laundry liquid','1 L',490,890,2,null], ['Kitchen paper','2 rolls',190,420,2,null],
  ],
  personal: [
    ['Toothpaste','100 g',230,490,3,null], ['Hand soap','250 mL',165,380,3,null],
    ['Deodorant','50 mL roll-on',270,550,2,null], ['Sanitary pads','10 pack',280,570,3,null],
  ],
};

export const seedCatalogue = Object.entries(groups).flatMap(([category, rows]) => rows.map(([name, pack_size, purchase_cost_cents, selling_price_cents, popularity_weight, shelf_life_days]) => ({
  category, name: `${name} — ${pack_size}`, pack_size, purchase_cost_cents, selling_price_cents, popularity_weight,
  perishable: Number(shelf_life_days !== null), shelf_life_days,
  initial_quantity: Math.ceil(2 * popularity_weight * (shelf_life_days === null ? 7 : Math.min(2, shelf_life_days - 1 || 1))),
}))).map((product, index) => ({ product_id: `P${String(index + 1).padStart(3, '0')}`, ...product }));
