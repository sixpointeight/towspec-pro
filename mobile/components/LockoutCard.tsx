import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import type { Lockout } from '@/lib/api';

interface Props {
  lockout: Lockout;
}

export default function LockoutCard({ lockout }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded(e => !e)}>
        <View style={styles.titleRow}>
          <Ionicons name="lock-closed" size={16} color="#94a3b8" style={styles.icon} />
          <Text style={styles.heading}>LOCKOUT PROCEDURES</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {lockout.difficultyLevel && (
            <View style={styles.diffRow}>
              <View style={styles.diffBadge}>
                <Text style={styles.diffLevel}>{lockout.difficultyLevel}</Text>
              </View>
              {lockout.difficultyDesc && (
                <Text style={styles.diffDesc} numberOfLines={3}>
                  {lockout.difficultyDesc}
                </Text>
              )}
            </View>
          )}

          {lockout.pictures && lockout.pictures.length > 0 && (
            <View style={styles.picsContainer}>
              {lockout.pictures.map((pic, i) => (
                <View key={i} style={styles.picItem}>
                  <Text style={styles.picLabel}>{pic.label.toUpperCase()}</Text>
                  <Image
                    source={{ uri: pic.src }}
                    style={styles.picImg}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </View>
          )}

          {(lockout.warnings || lockout.linkage) && (
            <View style={styles.metaTable}>
              {lockout.warnings && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Warnings</Text>
                  <Text style={styles.metaVal}>{lockout.warnings}</Text>
                </View>
              )}
              {lockout.linkage && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Linkage</Text>
                  <Text style={styles.metaVal}>{lockout.linkage}</Text>
                </View>
              )}
            </View>
          )}

          {lockout.openingInstructions && (
            <View style={styles.instructionsSection}>
              <Text style={styles.instructionsLabel}>OPENING INSTRUCTIONS</Text>
              <Text style={styles.instructionsText}>{lockout.openingInstructions}</Text>
            </View>
          )}

          {lockout.cautions && (
            <View style={styles.cautionsBox}>
              <View style={styles.cautionsHeader}>
                <Ionicons name="warning" size={14} color="#fbbf24" />
                <Text style={styles.cautionsTitle}>CAUTIONS</Text>
              </View>
              <Text style={styles.cautionsText}>{lockout.cautions}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#181a20',
    borderLeftWidth: 4,
    borderLeftColor: '#64748b',
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
    color: '#cbd5e1',
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  diffBadge: {
    backgroundColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  diffLevel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.text,
  },
  diffDesc: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  picsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  picItem: {
    flex: 1,
    alignItems: 'center',
  },
  picLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  picImg: {
    width: '100%',
    height: 90,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaTable: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
    alignItems: 'flex-start',
  },
  metaKey: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
    width: 64,
  },
  metaVal: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  instructionsSection: {
    marginBottom: 12,
  },
  instructionsLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  instructionsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.text,
    lineHeight: 21,
  },
  cautionsBox: {
    backgroundColor: '#1c1708',
    borderWidth: 1,
    borderColor: '#854d0e',
    borderRadius: 8,
    padding: 10,
  },
  cautionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cautionsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#fbbf24',
    letterSpacing: 1,
  },
  cautionsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#fde68a',
    lineHeight: 18,
  },
});
