<!--
  One section of the 白い熊 UI settings page: the settled heading (bold, underlined accent) with
  › folded / ⌄ open at the right, a tap on it folds or unfolds the rows. The line above stays
  in both states — folding hides a section's rows, never its header or that line.
-->
<template>
  <section
    :id="`skui-section-${sectionKey}`"
    class="skuiSection"
    :style="{ order: layout.orderOf(sectionKey) }"
  >
    <hr
      v-if="!layout.isFirst(sectionKey)"
      class="skuiSectionRule"
    >
    <button
      class="skuiSectionHeader"
      type="button"
      :aria-expanded="open"
      @click="layout.toggle(sectionKey)"
    >
      <h4 class="skuiSectionTitle">
        {{ title }}
      </h4>
      <span
        class="skuiFoldMark"
        :class="{ skuiFoldMarkOpen: open }"
        aria-hidden="true"
      />
    </button>
    <div v-show="open">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useSkuiPageLayout } from '../../helpers/skuiPageLayout'

const props = defineProps({
  sectionKey: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  }
})

const layout = useSkuiPageLayout()

const open = computed(() => layout.isOpen(props.sectionKey))
</script>

<style scoped src="./SkuiSettings.css" />
