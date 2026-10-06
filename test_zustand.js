const { create } = require('zustand');
const useStore = create((set) => ({ count: 0, inc: () => set(state => ({ count: state.count + 1 })) }));
useStore.subscribe((state, prevState) => {
  console.log("State:", state.count, "PrevState:", prevState ? prevState.count : 'undefined');
});
useStore.getState().inc();
