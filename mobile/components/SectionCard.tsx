import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sectionStyles, defaultSectionStyle } from '@/constants/colors';
import TowPicsRow from '@/components/TowPicsRow';
import type { TowPic } from '@/lib/api';

interface Props {
  heading: string;
  content: string;
  towPics?: TowPic[];
}

export default function SectionCard({ heading, content, towPics }: Props) {
  const [expanded, setExpanded] = useState(true);
  const style = sectionStyles[heading] ?? defaultSectionStyle;

  return (
    <View style={[styles.card, { backgroundColor: style.bg, borderLeftColor: style.border }]}>
      <Pressable style={styles.header} onPress={() => setExpanded(e => !e)}>
        <View style={styles.titleRow}>
          <Ionicons name={style.icon as any} size={16} color={style.border} style={styles.icon} />
          <Text style={[styles.heading, { color: style.label }]}>{heading.toUpperCase()}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded && (
        <View style={styles.body}>
          <Text style={styles.content}>{content}</Text>
          {towPics && towPics.length > 0 && <TowPicsRow towPics={towPics} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: colors.radius,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: 8,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  content: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
});
