import { motion } from "framer-motion";
import { Play, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KidPair } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/I18nProvider";
import { Dialog } from "@/components/ui/dialog";
import { Card, EmptyState, ErrorState, LevelTally, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api";
import { daysAgo, LEVELS, pct } from "@/lib/utils";
import { useClassrooms, useGroupAnalytics, useGroups } from "@/services/queries";
import { GroupForm } from "./GroupForm";

export default function GroupsPage() {
  const groups = useGroups();
  const rooms = useClassrooms();
  const stats = useGroupAnalytics(4);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const noRooms = rooms.data && rooms.data.length === 0;
  const t = useT();

  return (
    <>
      <PageHeader title={t("Learning groups")}
        sub={t("Children who are at a similar level practise together. BoltiToli guides one group while you teach another.")}
        actions={<Button onClick={() => (noRooms ? nav("/app/classrooms") : setCreating(true))}><Plus /> {t("New group")}</Button>} />
      {groups.isLoading || rooms.isLoading ? <Card><LoadingBlock /></Card>
        : groups.isError ? <ErrorState message={errorMessage(groups.error)} onRetry={() => groups.refetch()} />
        : !groups.data?.length ? (
          <Card>
            <EmptyState icon={<Users className="size-8" />} title={t(noRooms ? "Create a classroom first" : "No groups yet")}
              body={t(noRooms ? "Groups belong to a classroom." : "Most teachers start with three groups: Beginner, Developing and Advancing.")}
              action={noRooms ? <Button asChild><Link to="/app/classrooms">{t("Create a classroom")}</Link></Button>
                : <Button onClick={() => setCreating(true)}><Plus /> {t("Create a group")}</Button>} />
          </Card>
        ) : (
          <ul className="space-y-3" aria-label={t("Learning groups")}>
            {groups.data.map((g, i) => {
              const lv = LEVELS[g.level];
              const acc = stats.data?.find((s) => s.group_id === g.id)?.first_try_accuracy ?? null;
              return (
                <motion.li key={g.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  <Card className="flex flex-wrap items-center gap-4 p-3 pr-4 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                    <div className={`grid h-16 w-20 shrink-0 place-items-end justify-center rounded-[var(--radius-md)] ${lv.tint}`}>
                      <KidPair color={lv.color} className="h-14 w-16" />
                    </div>
                    <div className="min-w-44 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/app/groups/${g.id}`} className="text-[17px] font-bold hover:underline underline-offset-4">{g.name}</Link>
                        {g.sessions_count > 0 && <span className="rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-bold text-success-700">{t("Active")}</span>}
                      </div>
                      <p className="text-[13px] text-ink-muted"><LevelTally level={g.level} />{g.size ? ` · ${t("{n} children", { n: g.size })}` : ""}</p>
                      <p className="text-[13px]">
                        {g.current_skill ? <span lang="hi">{g.current_skill.name_hi}</span> : <span className="text-ink-muted">{t("Skill not chosen")}</span>}
                        <span className="text-ink-faint"> · {t("Last practice:")} {daysAgo(g.last_session_at, t)}</span>
                      </p>
                    </div>
                    <div className="hidden w-40 md:block">
                      <div className="flex justify-between text-[11px] text-ink-muted"><span>{t("Right first try")}</span><span className="font-semibold tabular text-ink">{pct(acc)}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-chalk-dim">
                        <motion.div className="h-full rounded-full" style={{ background: lv.color }} initial={{ width: 0 }} animate={{ width: `${acc ?? 0}%` }} transition={{ duration: 1, delay: 0.2 + i * 0.07 }} />
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => nav(g.current_skill ? `/app/sessions/new?group=${g.id}` : `/app/groups/${g.id}`)}>
                      <Play /> {t(g.current_skill ? "Start" : "Set skill")}
                    </Button>
                  </Card>
                </motion.li>
              );
            })}
          </ul>
        )}
      <Dialog open={creating} onOpenChange={setCreating} title={t("New learning group")}>
        <GroupForm defaultClassroom={rooms.data?.[0]?.id} onCancel={() => setCreating(false)} onSaved={(g) => {
          toast.success(t("Created {name}", { name: g.name }));
          setCreating(false);
        }} />
      </Dialog>
    </>
  );
}
