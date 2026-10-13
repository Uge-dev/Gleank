import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Choice, Panel } from './controls';
import { Button } from '@/features/marketplace/ui';
import { scheduleLabel, validateSchedule } from './scheduling';

function nextHour() { const d = new Date(Date.now() + 3600000); d.setSeconds(0, 0); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); return d.getTime(); }
export function ScheduleControl({ value, onChange }: { value?: number; onChange: (at?: number) => void }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(nextHour);
  const [month, setMonth] = useState(() => new Date());
  const [error, setError] = useState('');
  const date = new Date(at);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const setDay = (day: number) => { const d = new Date(at); d.setFullYear(month.getFullYear(), month.getMonth(), day); setAt(d.getTime()); setError(''); };
  function edit() { const selected = value ?? nextHour(); setAt(selected); setMonth(new Date(selected)); setError(''); setOpen(true); }
  return <Panel>
    <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center' }}><Ionicons name="calendar-outline" size={23} color={colors.text} /><GText weight="bold" style={{ fontSize: 18 }}>When to publish</GText></View>
    <View style={{ flexDirection: 'row', gap: 8 }}><Choice title="Now" active={!value} onPress={() => onChange(undefined)} /><Choice title="Schedule" active={!!value} onPress={edit} icon="time-outline" /></View>
    {value ? <Pressable onPress={edit} accessibilityLabel="Change scheduled publication time" style={{ minHeight: 48, justifyContent: 'center', gap: 4 }}><GText weight="bold">{scheduleLabel(value)}</GText><GText tone="muted">Change date & time →</GText></Pressable> : null}
    <GText tone="muted" style={{ fontSize: 12 }}>Times use your device timezone. Scheduled posts are published after server checks confirm availability and your selling eligibility.</GText>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => setOpen(false)} />
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '92%', padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><GText weight="bold" style={{ fontSize: 23 }}>Schedule your post</GText><Pressable onPress={() => setOpen(false)} accessibilityLabel="Close schedule" style={{ padding: 10 }}><Ionicons name="close" size={23} color={colors.text} /></Pressable></View>
          <ScrollView contentContainerStyle={{ gap: 17 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}><Choice title="In one hour" active={false} onPress={() => { const n = nextHour(); setAt(n); setMonth(new Date(n)); }} /><Choice title="Tomorrow, 9 am" active={false} onPress={() => { const n = new Date(); n.setDate(n.getDate() + 1); n.setHours(9, 0, 0, 0); setAt(n.getTime()); setMonth(n); }} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} accessibilityLabel="Previous month" style={{ padding: 12 }}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable><GText weight="bold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</GText><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityLabel="Next month" style={{ padding: 12 }}><Ionicons name="chevron-forward" size={22} color={colors.text} /></Pressable></View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{['M','T','W','T','F','S','S'].map((day, i) => <GText key={i} tone="muted" style={{ width: '14.285%', textAlign: 'center', paddingBottom: 8 }}>{day}</GText>)}{Array.from({ length: offset + days }, (_, i) => {
              const day = i - offset + 1;
              if (day < 1) return <View key={i} style={{ width: '14.285%', height: 44 }} />;
              const midnight = new Date(month.getFullYear(), month.getMonth(), day).getTime();
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const disabled = midnight < today.getTime() || midnight > Date.now() + 365 * 86400000;
              const selected = date.getDate() === day && date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
              return <Pressable key={i} disabled={disabled} onPress={() => setDay(day)} accessibilityLabel={new Date(midnight).toDateString()} accessibilityState={{ selected, disabled }} style={{ width: '14.285%', height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.text : 'transparent', borderRadius: 13, opacity: disabled ? .3 : 1 }}><GText weight="bold" style={{ color: selected ? colors.background : colors.text }}>{day}</GText></Pressable>;
            })}</View>
            <GText weight="bold">Hour · 24-hour clock</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{Array.from({ length: 24 }, (_, h) => <Choice key={h} title={String(h).padStart(2, '0')} active={date.getHours() === h} onPress={() => { const n = new Date(at); n.setHours(h); setAt(n.getTime()); }} />)}</View>
            <GText weight="bold">Minute</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{Array.from({ length: 12 }, (_, i) => i * 5).map(m => <Choice key={m} title={String(m).padStart(2, '0')} active={date.getMinutes() === m} onPress={() => { const n = new Date(at); n.setMinutes(m, 0, 0); setAt(n.getTime()); }} />)}</View>
            <GText weight="bold">{scheduleLabel(at)}</GText>{error ? <GText accessibilityRole="alert" tone="red">{error}</GText> : null}
          </ScrollView>
          <Button title="Use this time" onPress={() => { try { validateSchedule(at); onChange(at); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : 'Choose another time.'); } }} />
        </SafeAreaView>
      </View>
    </Modal>
  </Panel>;
}
