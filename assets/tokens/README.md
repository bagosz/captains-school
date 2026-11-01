# Custom token art

Any unit type can show your own image instead of the built-in icon. The base rim keeps the side's colour (blue for Good, red for Evil), and the image is cropped to a circle inside it.

The best results come from photos of your own painted miniatures taken from straight above:

1. Photograph the model from above on a plain background, with the base filling most of the frame.
2. Crop it to a square, around 256 to 512 px. PNG, JPG and WebP all work.
3. Save it in this folder, for example `orc.jpg`.
4. List it in `tokens.json` next to the unit type it should replace:

```json
{
  "orc": "orc.jpg",
  "warrior": "warrior.png",
  "troll": "troll.webp"
}
```

5. Reload the game. You can check every token at http://localhost:8765/dev/tokens.html.

Unit types (keys from `js/data/units.js`):

- Rohan: `warriorOfRohan`, `warriorOfRohanBow`, `rohanRoyalGuard`, `captainOfRohan`
- Gondor: `warriorOfMinasTirith`, `rangerOfGondor`
- Usurpers of Edoras: `hillTribesman`, `hillTribesmanBow`, `hillTribesChieftain`, `wulf`, `rohirrimTraitor`
- Isengard: `urukHaiWarrior`, `urukHaiCrossbow`
- Mordor: `mordorOrc`, `mordorOrcBow`, `mordorTroll`

Use only images you have the right to use, such as your own photos. Official Games Workshop artwork and product photos are copyrighted.
