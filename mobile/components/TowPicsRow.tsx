import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import type { TowPic } from '@/lib/api';

interface Props {
  towPics: TowPic[];
}

export default function TowPicsRow({ towPics }: Props) {
  if (!towPics || towPics.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.divider} />
      <View style={styles.row}>
        {towPics.map((col, i) => (
          <View key={i} style={styles.col}>
            <Text style={styles.label}>{col.label.toUpperCase()}</Text>
            <View style={styles.imagesRow}>
              {col.images.map((src, j) => (
                <Image
                  key={j}
                  source={{ uri: src }}
                  style={styles.img}
                  resizeMode="contain"
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#ef444440',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: '#fca5a5',
    letterSpacing: 1,
    marginBottom: 6,
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  img: {
    width: 64,
    height: 64,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef444440',
  },
});
