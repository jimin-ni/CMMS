import { Arcade } from "@/components/minigame/arcade";
import { roleLabel } from "@/lib/access";
import { MOCK_PLAYERS } from "@/lib/minigame/mock-store";

export default function MinigamePage() {
  const players = MOCK_PLAYERS.map(({ id, name, role }) => ({
    id,
    name,
    roleLabel: roleLabel(role),
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-12">
      <Arcade players={players} />
    </main>
  );
}
