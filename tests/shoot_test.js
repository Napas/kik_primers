import { assertEquals } from "@std/assert";
import { shotList } from "../tools/shoot.ts";

Deno.test("shotList takes the start view, then one spot per room: its first person, else its first spot", () => {
  const pack = {
    rooms: [{ n: 1 }, { n: 2 }, { n: 3 }],
    spots: [
      { id: "knyga", room: 1, kind: "work" },
      { id: "rasytojas", room: 1, kind: "person" },
      { id: "ivykis", room: 2, kind: "event" },
    ],
  };
  assertEquals(shotList(pack), [
    { name: "start", hash: "" },
    { name: "room-1", hash: "#rasytojas" },
    { name: "room-2", hash: "#ivykis" },
  ]);
});
