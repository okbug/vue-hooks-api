import { getCurrentInstance, watchEffect } from "vue";

type CurrentRenderingFiber =ICurrentlyRenderingFiber | null

interface ICurrentlyRenderingFiber {
  alternate?: CurrentRenderingFiber;
  update?: () => void;
  memorizedState?: CurrentRenderingFiber 
  uid?: number;
  next?: CurrentRenderingFiber;
  hookFlags?: number;
  create?: any;
  deps?: any
}

// useLayoutEffect 的标记
const HookLayout = /*    */ 0b010;
// useEffect 的标记
const HookPassive = /*   */ 0b100;

// 当前的渲染的 Fiber 节点，对应 Vue 中则是当前渲染的组件函数的实例
let currentlyRenderingFiber: CurrentRenderingFiber = null;
// 当前正在工作的 Hook 节点
let workInProgressHook: any = null;
// 前一个 Hook
let currentHook: any = null;

// React 中启动一个 Fiber 协调的任务
function scheduleUpdateOnFiber(wip: any) {
  if (!currentlyRenderingFiber) {
    return
  }
  // 保存老 Fiber
  currentlyRenderingFiber.alternate = { ...currentlyRenderingFiber };
  renderHooks(wip);
  currentlyRenderingFiber!.update!();
}

// 初始化 Hooks 的相关设置
function renderHooks(wip: any) {
  currentlyRenderingFiber = wip as ICurrentlyRenderingFiber;
  currentlyRenderingFiber.memorizedState = null;
  workInProgressHook = null;
}

// Hooks 设置
function updateWorkInProgressHook() {
  if (!currentlyRenderingFiber) {
    return null
  }
  const instance = getCurrentInstance() as any;
  if (
    !currentlyRenderingFiber ||
    currentlyRenderingFiber.uid !== instance.uid
  ) {
    renderHooks(instance);
  }
  // alternate 是老 Fiber 的属性 
  const current = currentlyRenderingFiber.alternate;
  let hook: CurrentRenderingFiber = null;
  // 存在老的则是更新节点
  if (current) {
    currentlyRenderingFiber.memorizedState = current.memorizedState;
    if (workInProgressHook) {
      // 不是头节点
      hook = workInProgressHook = workInProgressHook.next;
      currentHook = currentHook.next;
    } else {
      // 头节点
      hook = workInProgressHook = current.memorizedState!;
      currentHook = current.memorizedState;
    }
  } else {
    // 初始化
    currentHook = null;
    hook = {
      memorizedState: null,
      next: null,
    };

    if (workInProgressHook) {
      // 不是头节点
      workInProgressHook = workInProgressHook.next = hook;
    } else {
      // 头节点
      workInProgressHook = currentlyRenderingFiber.memorizedState = hook;
    }
  }

  return hook;
}

export function useState(initialState: any) {
  return useReducer(null, initialState);
}

export function useReducer(reducer: any, initialState: any) {
  // 获取 Hook
  const hook = updateWorkInProgressHook();
  if (!hook) {
    return [];
  }
  if (!currentlyRenderingFiber || !currentlyRenderingFiber.alternate) {
    hook.memorizedState = initialState;
  }
  // 通过 bind 方法进行缓存当前的组件函数的 Fiber 节点，Vue3 中则是函数组件的实例对象
  const dispatch = dispatchReducerAction.bind(
    null,
    currentlyRenderingFiber,
    hook,
    reducer
  );

  return [hook.memorizedState, dispatch];
}

function dispatchReducerAction(
  fiber: any,
  hook: any,
  reducer: any,
  action: any
) {
  hook.memorizedState = reducer ? reducer(hook.memorizedState) : action;
  // 调用 dispatch 的时候重新执行函数组件的渲染
  scheduleUpdateOnFiber(fiber);
}

function updateEffectImp(hookFlags: number, create: any, deps: any) {
  // 获取 Hook
  const hook = updateWorkInProgressHook();
  // 如果存在老 Hook 则进行对比
  if (currentHook) {
    const prevEffect = currentHook.memorizedState;
    if (deps) {
      const prevDeps = prevEffect.deps;
      if (areHookInputsEqual(deps, prevDeps)) {
        return;
      }
    }
  }
  const effect = { hookFlags, create, deps };
  hook!.memorizedState = effect;

  invokeHooks(hookFlags, hook);
}

export function useEffect(create: any, deps: any) {
  return updateEffectImp(HookPassive, create, deps);
}

export function useLayoutEffect(create: any, deps: any) {
  return updateEffectImp(HookLayout, create, deps);
}

// 比较前后两个依赖是否发生变化
function areHookInputsEqual(nextDeps: any, prevDeps: any) {
  if (prevDeps === null) {
    return false;
  }

  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (Object.is(nextDeps[i], prevDeps[i])) {
      continue;
    }
    return false;
  }
  return true;
}

// 调用 Hooks
function invokeHooks(hookFlags: number, hook: any) {
  if (hookFlags & HookPassive) {
    postMessage(hook.memorizedState.create);
  } else if (hookFlags & HookLayout) {
    watchEffect(hook.memorizedState.create, { flush: "post" });
  }
}

// 通过 MessageChannel 创建一个宏任务
const postMessage = (create: any) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    create();
  };
  port2.postMessage(null);
};
