#include "ipc_runtime/signal_handlers.hpp"

#include <atomic>
#include <csignal>
#include <cstdlib>
#include <iostream>

#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#include <thread>
#include <unistd.h>
#endif

namespace ipc {

namespace {

// File-scope pointer used by signal handlers. Atomic so handler execution
// (which may interrupt main() at any point) observes a consistent value.
std::atomic<IpcServer *> g_signal_server{nullptr};

void graceful_shutdown_handler(int signal) {
  std::cerr << "\nReceived signal " << signal << ", shutting down gracefully..."
            << '\n';
  if (auto *s = g_signal_server.load(std::memory_order_acquire); s != nullptr) {
    s->request_shutdown();
  }
}

void fatal_error_handler(int signal) {
  const char *signal_name = (signal == SIGBUS)    ? "SIGBUS"
                            : (signal == SIGSEGV) ? "SIGSEGV"
                                                  : "UNKNOWN";
  std::cerr << "\nFatal error: received " << signal_name << '\n';
  if (auto *s = g_signal_server.load(std::memory_order_acquire); s != nullptr) {
    s->close();
  }
  std::exit(1);
}

void setup_parent_death_monitoring() {
#ifdef __linux__
  if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
    std::cerr << "Warning: Could not set parent death signal" << '\n';
  }
#elif defined(__APPLE__)
  pid_t parent_pid = getppid();
  std::thread([parent_pid]() {
    int kq = kqueue();
    if (kq == -1) {
      std::cerr << "Warning: Could not create kqueue for parent monitoring"
                << '\n';
      return;
    }
    struct kevent change;
    EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0,
           nullptr);
    if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
      std::cerr << "Warning: Could not monitor parent process" << '\n';
      close(kq);
      return;
    }
    struct kevent event;
    kevent(kq, nullptr, 0, &event, 1, nullptr);
    std::cerr << "Parent process exited, shutting down..." << '\n';
    close(kq);
    std::exit(0);
  }).detach();
#endif
}

} // namespace

void install_default_signal_handlers(IpcServer &server) {
  g_signal_server.store(&server, std::memory_order_release);
  (void)std::signal(SIGTERM, graceful_shutdown_handler);
  (void)std::signal(SIGINT, graceful_shutdown_handler);
  (void)std::signal(SIGBUS, fatal_error_handler);
  (void)std::signal(SIGSEGV, fatal_error_handler);
  setup_parent_death_monitoring();
}

} // namespace ipc
